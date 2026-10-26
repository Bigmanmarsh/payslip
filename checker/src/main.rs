//! payslip-scan: lists the payments a Zcash account has RECEIVED, using only its
//! incoming viewing key (UIVK).
//!
//! An incoming viewing key can see incoming payments and their memos. It cannot see
//! where money was sent afterwards, cannot see spends, and cannot spend. That is the
//! privacy property our proof-of-income checker depends on.
//!
//! Output: one JSON object per received payment, on stdout.

use std::time::Duration;

use anyhow::{Context, anyhow};
use clap::Parser;
use orchard::keys::PreparedIncomingViewingKey;
use orchard::note_encryption::{CompactAction, IronwoodDomain, OrchardDomain};
use tonic::transport::{Channel, ClientTlsConfig};
use zcash_client_backend::proto::service::{
    BlockId, BlockRange, ChainSpec, TxFilter, compact_tx_streamer_client::CompactTxStreamerClient,
};
use zcash_keys::keys::UnifiedIncomingViewingKey;
use zcash_note_encryption::{try_compact_note_decryption, try_note_decryption};
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::{BlockHeight, BranchId, TEST_NETWORK};
use zcash_protocol::memo::{Memo, MemoBytes};

/// Give up if the server sends nothing for this long, instead of hanging forever.
const STALL_LIMIT: Duration = Duration::from_secs(60);

#[derive(Parser)]
#[command(about = "List payments received by a Zcash testnet account, using only its incoming viewing key")]
struct Args {
    /// The account's Unified Incoming Viewing Key (starts with "uivktest1").
    #[arg(long)]
    uivk: String,
    /// Block height to start scanning from (the account's birthday).
    #[arg(long)]
    from: u32,
    /// lightwalletd server, as host:port.
    #[arg(long, default_value = "testnet.zec.rocks:443")]
    server: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let _ = rustls::crypto::ring::default_provider().install_default();

    let uivk = UnifiedIncomingViewingKey::decode(&TEST_NETWORK, &args.uivk)
        .map_err(|e| anyhow!("Not a valid testnet incoming viewing key: {e}"))?;
    let ivk = uivk
        .orchard()
        .as_ref()
        .ok_or(anyhow!("This key has no Orchard/Ironwood component"))?;
    // Ironwood outputs are decrypted with the account's Orchard incoming viewing key.
    // A UIVK only holds the External scope: payments from others, not the account's own change.
    let pivk = PreparedIncomingViewingKey::new(ivk);

    let mut client = connect(&args.server).await?;

    let tip = client
        .get_latest_block(ChainSpec {})
        .await
        .context("Could not reach the lightwalletd server")?
        .into_inner()
        .height;

    // Pass 1: trial-decrypt compact blocks. We download every block in the range,
    // so the server does not learn which transactions belong to this key.
    let mut found: Vec<(Vec<u8>, u64)> = vec![];
    let mut stream = client
        .get_block_range(BlockRange {
            start: Some(BlockId { height: args.from as u64, hash: vec![] }),
            end: Some(BlockId { height: tip, hash: vec![] }),
            pool_types: vec![],
        })
        .await?
        .into_inner();
    while let Some(block) = tokio::time::timeout(STALL_LIMIT, stream.message())
        .await
        .map_err(|_| anyhow!("The lightwalletd server stopped responding. Check your internet connection and try again."))??
    {
        for tx in &block.vtx {
            let hits = tx.ironwood_actions.iter().chain(tx.actions.iter()).any(|a| {
                CompactAction::try_from(a)
                    .ok()
                    .map(|ca| {
                        try_compact_note_decryption(&IronwoodDomain::for_compact_action(&ca), &pivk, &ca)
                            .is_some()
                            || try_compact_note_decryption(&OrchardDomain::for_compact_action(&ca), &pivk, &ca)
                                .is_some()
                    })
                    .unwrap_or(false)
            });
            if hits {
                found.push((tx.txid.clone(), block.height));
            }
        }
    }

    // Pass 2: fetch the full transactions we found, to read the memos.
    // Note: this tells the server which transactions we are interested in.
    for (txid, height) in found {
        let raw = client
            .get_transaction(TxFilter { block: None, index: 0, hash: txid.clone() })
            .await?
            .into_inner();
        let branch = BranchId::for_height(&TEST_NETWORK, BlockHeight::from_u32(height as u32));
        let tx = Transaction::read(&raw.data[..], branch).context("Could not parse transaction")?;

        let mut outputs = vec![];
        if let Some(bundle) = tx.ironwood_bundle() {
            for action in bundle.actions() {
                if let Some(o) = try_note_decryption(&IronwoodDomain::for_action(action), &pivk, action) {
                    outputs.push(("ironwood", o));
                }
            }
        }
        if let Some(bundle) = tx.orchard_bundle() {
            for action in bundle.actions() {
                if let Some(o) = try_note_decryption(&OrchardDomain::for_action(action), &pivk, action) {
                    outputs.push(("orchard", o));
                }
            }
        }

        // Display order for txids is byte-reversed.
        let mut display_txid = txid.clone();
        display_txid.reverse();

        for (pool, (note, _addr, memo)) in outputs {
            let memo_text = MemoBytes::from_bytes(&memo)
                .ok()
                .and_then(|mb| Memo::try_from(mb).ok())
                .and_then(|m| match m {
                    Memo::Text(t) => Some(t.to_string()),
                    _ => None,
                });
            println!(
                "{}",
                serde_json::json!({
                    "txid": hex::encode(&display_txid),
                    "height": height,
                    "pool": pool,
                    "value_zat": note.value().inner(),
                    "memo": memo_text,
                })
            );
        }
    }

    Ok(())
}

async fn connect(server: &str) -> anyhow::Result<CompactTxStreamerClient<Channel>> {
    let (host, _port) = server
        .rsplit_once(':')
        .ok_or(anyhow!("--server must be host:port"))?;
    let channel = Channel::from_shared(format!("https://{server}"))?
        .connect_timeout(Duration::from_secs(20))
        .http2_keep_alive_interval(Duration::from_secs(20))
        .keep_alive_timeout(Duration::from_secs(20))
        .keep_alive_while_idle(true)
        .tls_config(
        ClientTlsConfig::new()
            .domain_name(host.to_string())
            .assume_http2(true)
            .with_webpki_roots(),
    )?;
    Ok(CompactTxStreamerClient::new(channel.connect().await?))
}
