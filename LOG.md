# Project Log

## 2026-10-20 (Claude)
- Idea locked: private payroll with salary account + employer-signed payslips. See 01_project_brief.md.
- Installed Git, Node.js 24, Rust 1.99, VS 2022 C++ Build Tools.
- Project folder moved to C:\zecathon (old temp path was too long for git).
- Cloned zcash-devtool (commit 0b3436b) into tools/ and started release build.
- Added .gitignore so wallets, keys and seeds never get committed.

## 2026-10-21 (Claude)
- zcash-devtool built (release, ~33 min) and copied to bin/ (gitignored).
- Created testnet wallets wallets/employer and wallets/worker (Ironwood-capable UAs; secrets encrypted in .age files, gitignored).
- Faucet: 1 TAZ from fauzec.com to Employer (txid 2d807bde...bd7a86), landed in Ironwood pool. Needed 10 confirmations (~5 min) before spendable.
- DAY-1 TEST PASSED: Employer -> Worker 0.1 TAZ, Ironwood, memo "Payslip #001 | Zecathon Test Co | Oct 2026 | 0.1 TAZ". txid a6f2650d...7ec4cb1b, mined at 4524492, fee 0.00025 TAZ.
- Lessons: memos only appear after `wallet enhance` (compact sync has no memos). zec.rocks testnet server had one connection timeout; retry worked.
- Created wallets/worker2 and wallets/worker3. Wrote scripts/make-payment-uri.mjs: turns scripts/payroll.csv into one ZIP 321 multi-recipient URI (base64url memos, 512-byte check).
- BATCH TEST PASSED: `wallet pay` with the URI paid Worker 0.05, Worker2 0.04, Worker3 0.03 TAZ in ONE Ironwood tx (f88d303b...98558f0, mined 4526126), fee 0.0002 TAZ. Each worker sees only its own payment and memo.
- VIEW-ONLY TEST PASSED: view-only wallet from Worker's UFVK (wallets/landlord-view) lists both Worker payslips (#001, #002) and nothing of Worker2/3; sending fails with "Cannot spend from view-only accounts".
- DESIGN ISSUE: zcash-devtool only imports FULL viewing keys, which also reveal outgoing payments (could expose where the worker moves salary, e.g. their personal wallet). The real checker must use an incoming-only key (UIVK). Next: build our own UIVK-based checker.

## 2026-10-22/23 (Claude)
- Built checker/ (Rust, binary `payslip-scan`): takes a UIVK + birthday, downloads ALL compact blocks in range (server can't tell which txs are ours), trial-decrypts Ironwood/Orchard actions with the Orchard IVK (External scope only), then fetches matching full txs to read memos. Outputs JSON lines. Needed rustls ring provider installed explicitly.
- Built scripts/payslip.mjs: Ed25519 employer keys (keygen), signed ZPAY1 memos in a ZIP 321 batch (pay-request), and verify (signature, amount-paid == payslip amount, duplicate payslip IDs, unknown employer). 8 unit tests pass (scripts/payslip.test.mjs).
- Employer key: employers/zecathon-test-co.json (public); secret in wallets/ (gitignored, *.signing.json also ignored).
- SIGNED PAYROLL: tx a9b87c72...acc3a075 paid Worker #005 0.06 and Worker2 #006 0.04 with signed memos. fee 0.00015.
- END-TO-END PASSED: payslip-scan with Worker's UIVK found Worker's 3 incoming payments in ~9 s; verify -> #005 VERIFIED, 2 unsigned memos skipped.
- PRIVACY CLAIM PROVEN: Worker sent 0.02 TAZ to a stand-in "personal wallet" (tx 597353ef...85c47502). The FULL viewing key reveals the destination address and memo. The UIVK checker shows nothing of it. => checker must only ever use the UIVK.
- Built the web app: app/server.mjs (Node, no dependencies, listens on 127.0.0.1:4321) + app/public/{index,employer,worker,check}.html + style.css. Run: `node app/server.mjs`. Preview config in .claude/launch.json ("payslip").
  - Employer page: balance, public stamp, editable payroll table / CSV import, preview signed memos, pay in one shielded tx.
  - Worker page: salary address + "proof code" (<birthday>:<uivk>) per demo wallet, with copy button.
  - Checker page: paste proof code -> payslip-scan (UIVK only) -> verify -> verified totals per employer/period + every incoming payment with reasons, plus "what this proves / does not show".
- Refactored payslip.mjs: buildPaymentRequest() + loadSigningKey() shared by CLI and server (output byte-identical; 8 tests still pass).
- UI TEST PASSED: checker showed #005 verified (0.06), 2 unsigned memos skipped. Employer page paid Worker3 #007 0.025 TAZ via the UI (tx d962c5d0...4d1e0775, fee 0.0001).
- Input validation tested (bad proof, mainnet address, "|" in fields, duplicate IDs, bad amount, empty list, path traversal) -> all rejected cleanly. Server log contains routes only, no viewing keys.

## 2026-10-23 (Claude)
- Removed superseded files (make-payment-uri.mjs, unsigned payroll.csv, generated URI txt files). Renamed payroll-signed.csv -> scripts/example-payroll.csv.
- Wrote README.md (problem, privacy table with tested limits, anti-cheating rules, architecture, Windows setup from scratch, demo walkthrough, testnet txids) and MIT LICENSE.
- git init (branch main), all files staged, NOT committed yet (needs the user's git name/email). Secret scan of staged files: clean. bin/, tools/, wallets/ are ignored.
