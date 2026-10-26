# ZECATHON submission: copy-paste text

Deadline: **28 Oct 2026, 23:59 UTC** (29 Oct, 00:59 Lagos time). Aim to submit on 27 Oct.

---

## Project name
Payslip

## Track
Shielded Payments

## One-line pitch
Private payroll on Zcash: pay your team in one shielded transaction with employer-signed payslips, and let workers prove their income without exposing their wallet.

## Description

**The problem.** Crypto earners are usually paid on public chains, so anyone can see what they earn, who pays them and what they do with it. That leads to targeted theft, begging and tracking. And when they need to prove income to a landlord, lender or embassy, the only option is to reveal their whole wallet.

**What Payslip does.**
1. **Private batch payroll.** The employer pays the whole team in one shielded Zcash transaction (Ironwood pool) using a ZIP 321 multi-recipient payment request.
2. **Employer-signed payslips.** Each payment carries an encrypted memo with an Ed25519-signed payslip (employer, payslip #, worker, period, amount). Only the worker can read it.
3. **Salary account + proof code.** Workers receive pay into a separate salary account. To prove income, they share a proof code: the account's incoming viewing key (UIVK) plus its start height.
4. **Income checker.** A landlord pastes the code. Our Rust scanner trial-decrypts the chain with the incoming key only, and the checker verifies every payslip's signature, checks that the amount actually paid matches the payslip, and rejects duplicates and unknown employers.

**Privacy model (tested on testnet).** The public sees nothing about who was paid or how much. The checker sees payments *into* the salary account, and nothing else: no personal wallet, no spending, no balance, and no destinations. We tested this: a full viewing key reveals where a worker moved salary afterwards, while our incoming-key checker does not, so Payslip only ever accepts incoming keys.

**Honest limits.** The proof code reveals every payment into the salary account (not just one), so it should be used for salary only. The chain still shows that a transaction happened, when, and its number of outputs. The lightwalletd server sees the IP of whoever scans, and learns which transactions are fetched for memos. A proof code doesn't by itself prove the presenter owns the account. Testnet only, not audited.

**What's new.** Zcash wallets can send and receive privately, but nothing lets an everyday crypto earner prove income without exposing their wallet. Payslip combines a payroll workflow, employer-signed payslips with anti-cheating checks, and an incoming-key-only checker, aimed at real users like freelancers and community teams in Africa.

**Built with.** Rust (librustzcash: zcash_client_backend, zcash_keys, orchard / Ironwood note decryption), Node.js (no dependencies), zcash-devtool, lightwalletd (testnet.zec.rocks).

**Testnet evidence** (transaction IDs are in the README): a batch of 3 workers in one transaction; signed payslips #005, #006, #007, #008; a salary move invisible to the checker.

## Repository
https://github.com/Bigmanmarsh/payslip

## Demo
Video: <PASTE YOUR YOUTUBE LINK HERE>
To run it yourself: see "Setup" and "Demo walkthrough" in the README (runs locally on Zcash testnet).

## 2-minute video
<PASTE YOUR YOUTUBE LINK HERE>

## Prize address (shielded ZEC)
<YOUR OWN MAINNET SHIELDED ADDRESS, e.g. from Zashi, starting with u1… or zs1…>
Only ever share the **address**. Never the recovery phrase.

## Team note
Built by Marshall (@Bigmanmarsh), with AI assistants (Claude as lead engineer, Arena as research teammate).
