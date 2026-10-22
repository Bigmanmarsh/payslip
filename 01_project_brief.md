# Project Brief (working name: Payslip)

Status: locked 20 Oct 2026. Deadline 28 Oct 2026 23:59 UTC (target: submit 27 Oct).
Track: Shielded Payments (payroll is listed under it).

## One sentence
Pay your team privately in one batch, and give each person an employer-signed payslip they can use to prove their income, without exposing their personal wallet.

## The problem
Crypto earners (especially in Africa) are paid on public chains, so anyone can see what they earn and from whom. That creates security risks, begging, tracking, and copied trades. When they need to prove income to a landlord, lender or embassy, they have to reveal their whole wallet.

## The users
- Payer: a founder, team lead or small company paying a team.
- Worker: a crypto earner who wants pay to stay private, but needs to prove income sometimes.
- Checker: a landlord, lender or embassy who needs to verify income.

## How it works
1. Salary account: each worker receives pay into a separate shielded account used only for salary.
2. Batch payroll: the payer uploads names, addresses and amounts, and pays everyone in one shielded transaction. Each output carries a payslip memo.
3. Signed payslip: each memo is signed with the employer's key. The employer publishes its public key (website or X).
4. Proof of income: the worker shares a view-only key (incoming viewing key) for the salary account. The checker page lists salary payments and checks each payslip signature.

## Privacy model (honest version)
Private from the public: senders, recipients, amounts and memos of all payments.
Shown to the checker: all payments into the salary account (not just one), with amounts, dates and memos.
Not shown to the checker: the worker's personal wallet, spending, balance, or other accounts.
Still visible publicly: a batch transaction's number of outputs and its timing.
Lightwalletd servers see IP addresses unless Tor is used. Our app stores no user data on a server.

## Scope
In: batch payroll, signed payslip memos, salary account setup, checker page, testnet only.
Out (future plans): mainnet, per-payment proofs, Tor, mobile app, premium features.

## Tech (to confirm on day 1)
zcash-devtool (Rust) on testnet for wallets and sending. A web page for payroll upload and the checker. Ed25519 signatures for payslips.
Pool: Sapling or Ironwood (Orchard is closed to new funds since 28 Jul 2026).

## Build order
1. Day-1 test: send a shielded payment with a memo from wallet A, read it in wallet B.
2. Batch payment to 3+ recipients with memos.
3. Payslip signing and checking.
4. Checker page using a viewing key.
5. Clean design, privacy review, README, 2-minute video, submit.
