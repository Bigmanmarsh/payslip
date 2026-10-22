# Payslip: private payroll on Zcash with provable income

**Pay your team privately. Let them prove their income without exposing their wallet.**

Built for [ZECATHON](https://thezecathon.com) 2026 · Track: **Shielded Payments** · Runs on **Zcash testnet**

---

## The problem

Crypto earners are usually paid on public blockchains. Anyone who learns their address can see what they earn, who pays them, and everything they do with it. That creates real harm: targeted theft, relatives and strangers asking for money, people tracking and copying their moves.

Then, when they need to **prove** their income to a landlord, lender or embassy, the only way is to show their wallet, which exposes everything.

## What Payslip does

1. **Private batch payroll.** An employer pays the whole team in **one shielded Zcash transaction** (Ironwood pool). On chain, nobody can see who was paid or how much.
2. **Signed payslips.** Every payment carries an encrypted memo with a payslip **signed by the employer** (Ed25519). Only the worker can read it.
3. **Salary account + proof code.** Each worker receives pay into a separate salary account. To prove income, they share a **proof code**: the account's *incoming viewing key* (UIVK) plus its start height.
4. **Income checker.** A landlord pastes the proof code. Payslip scans the chain with that view-only key, checks every payslip's signature against the employer's published public key, and shows the verified salary history.

## What is private, and what is not

We'd rather be precise than impressive. Everything below was tested on testnet (see [LOG.md](LOG.md)).

| | Public observer | Checker with the proof code | Employer |
|---|---|---|---|
| Who paid whom | ❌ hidden | Sees payments **into** the salary account | Knows who they paid |
| Amounts | ❌ hidden | ✅ for salary received | ✅ what they paid |
| Payslip memo | ❌ hidden | ✅ | ✅ (they wrote it) |
| Worker's personal wallet | ❌ hidden | ❌ **hidden** | ❌ hidden |
| Where the worker sends money afterwards | ❌ hidden | ❌ **hidden** | ❌ hidden |
| Worker's spending / balance | ❌ hidden | ❌ hidden | ❌ hidden |
| Other workers' pay | ❌ hidden | ❌ hidden | ✅ |

**Why an *incoming* viewing key and not a full one?** We tested both. A full viewing key also reveals outgoing payments, including the destination address when a worker moves salary to a personal wallet. The incoming key does not. So the checker only ever accepts incoming keys.

**Known limits (stated plainly):**
- The proof code reveals **all** payments into the salary account, not just one. Workers should use the account only for salary.
- The blockchain still shows that a transaction happened, when, and how many outputs a batch has.
- The lightwalletd server sees the IP address of whoever syncs or scans. The checker downloads every block in the range, so the server can't tell which payments match. It then fetches the matching transactions by ID to read memos, which reveals interest in those transactions. Tor support is future work.
- A proof code shows what an account received. It does not prove that the person showing it **owns** that account. A checker should confirm ownership, for example by sending a tiny payment to the worker's salary address and asking them to read back its memo.
- Payslip signatures prove the employer *signed* a payslip. They don't prove the employer is who they claim to be. That depends on the employer publishing their public key somewhere trusted (website, X profile).
- Testnet only. Not audited. Do not use with real funds.

## How payslips are protected against cheating

A payslip memo looks like:

```
ZPAY1|<employer-id>|<payslip-#>|<worker>|<period>|<amount-in-zatoshi>|<ed25519-signature>
```

The checker rejects a payslip if:
- the signature doesn't match the employer's published key (forged or edited payslip)
- the **amount actually paid** differs from the amount on the payslip
- the same payslip number was already counted (a worker re-sending themselves a copy)
- the employer is unknown

These rules are covered by unit tests in [`scripts/payslip.test.mjs`](scripts/payslip.test.mjs).

## Architecture

```
app/public/*.html  ──►  app/server.mjs (Node, localhost only)
                          ├─ scripts/payslip.mjs   sign / verify payslips, build ZIP 321 batch requests
                          ├─ bin/zcash-devtool.exe  wallets, sync, shielded batch payments
                          └─ bin/payslip-scan.exe   our Rust scanner: incoming-viewing-key-only
                                                    trial decryption of Ironwood/Orchard outputs
```

- **checker/** (`payslip-scan`): Rust. Takes a UIVK, streams compact blocks from lightwalletd, trial-decrypts Ironwood (and Orchard) actions with the incoming viewing key, then fetches matching transactions to decrypt memos. Prints JSON lines. It never holds spending or full viewing keys.
- **scripts/payslip.mjs**: Node, no dependencies. Employer key generation, payslip signing, ZIP 321 multi-recipient payment requests, and verification.
- **app/**: Node HTTP server with no dependencies and three pages (Employer, Worker, Checker). Viewing keys sent to the checker are used once and are never stored or logged.
- **zcash-devtool**: the official Zcash developer CLI (not our code), used for the wallets and for sending.

## Setup (Windows, from scratch)

You need about 12 GB of free disk space and around an hour, mostly for builds.

1. Install the tools (PowerShell):
   ```powershell
   winget install --id Git.Git -e
   winget install --id OpenJS.NodeJS.LTS -e
   winget install --id Rustlang.Rustup -e
   winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```
   Then open a new terminal so the new tools are on your PATH.
2. Clone this repository into a **short path** (long Windows paths break the builds), for example `C:\zecathon`.
3. Build zcash-devtool at the commit we tested:
   ```powershell
   git clone https://github.com/zcash/zcash-devtool.git tools/zcash-devtool
   git -C tools/zcash-devtool checkout 0b3436b
   cargo build --release --manifest-path tools/zcash-devtool/Cargo.toml
   mkdir bin; copy tools\zcash-devtool\target\release\zcash-devtool.exe bin\
   ```
4. Build the scanner:
   ```powershell
   cargo build --release --manifest-path checker/Cargo.toml
   copy checker\target\release\payslip-scan.exe bin\
   ```
5. Create testnet wallets (press Enter when asked for a mnemonic, to generate a new one):
   ```powershell
   .\bin\zcash-devtool.exe wallet -w wallets\employer init --name "Employer" -i wallets\employer.age -n test
   .\bin\zcash-devtool.exe wallet -w wallets\worker init --name "Worker" -i wallets\worker.age -n test
   .\bin\zcash-devtool.exe wallet -w wallets\employer list-addresses
   ```
6. Get free testnet TAZ for the employer's `utest1…` address at [fauzec.com](https://fauzec.com). Wait about 5 minutes (10 confirmations).
7. Create the employer's signing key:
   ```powershell
   node scripts/payslip.mjs keygen my-company "My Company"
   ```
   This writes a **secret** key to `wallets/` (never share it) and a public key to `employers/` (publish it). To use your own employer instead of the demo one, run `$env:EMPLOYER_ID = "my-company"` in the same terminal before starting the app.
8. Start the app and open http://localhost:4321:
   ```powershell
   node app/server.mjs
   ```

Run the tests with `node --test scripts/payslip.test.mjs`.

## Demo walkthrough

1. **Employer:** add the workers' salary addresses and amounts (or import [`scripts/example-payroll.csv`](scripts/example-payroll.csv)), click **Preview payslips**, then **Pay everyone privately**.
2. **Worker:** open the Worker page and copy the salary proof code.
3. **Checker:** paste the proof code and click **Check income**. You'll see verified payslips and totals per employer and month. Unsigned or tampered payments are listed but not counted.

## Testnet evidence

| What | Transaction |
|---|---|
| First shielded payment with memo | `a6f2650db2a480998968f7212134f4dbec5aa0114ad0f9e45fe5bbc07ec4cb1b` |
| Batch: 3 workers in one transaction | `f88d303b0dea0da71485d4b9da211d5c7a2cf7c3fe88ce12736c5fe7998558f0` |
| Signed payslips #005, #006 | `a9b87c72941bb48a17c4d525865a45ea158a7fd09b46cc23bb7685bbacc3a075` |
| Worker moves salary to a personal wallet (invisible to the checker) | `597353ef76c114a183fd0abfc473c1e77119698ed549a2f49d4cebc085c47502` |
| Payroll sent from the web app | `d962c5d00ad827c9f2e856f894fc734b1c4757ebc4a32b373a9dcdd74d1e0775` |

## Future work

- Per-payment disclosure, so a worker can reveal one payslip instead of the whole salary account
- Tor routing for syncing and scanning
- Wallet integration (e.g. a "Share salary proof" button in mobile wallets)
- Mainnet, after a security review

## License

MIT. See [LICENSE](LICENSE). zcash-devtool is a separate project under its own MIT/Apache-2.0 license and is not included in this repository.
