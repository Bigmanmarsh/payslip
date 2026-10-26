# Payslip: 2-minute demo video

Target length: 1:55 to 2:00. Speak calmly; about 270 words in total.
**[Brackets]** = what's on screen. Plain text = what you say.

---

## 1. The problem (0:00 to 0:20)

**[You on camera, or the home page of the app]**

> I'm Marshall, and like a lot of people in my community, I earn in crypto.
> On public blockchains, anyone with my address can see what I earn and who pays me.
> That brings real problems: security risks, people begging, people tracking and copying my moves.
> And when I need to prove my income to a landlord or a lender, I have to show my whole wallet.

## 2. The idea (0:20 to 0:40)

**[Home page: the three cards]**

> Payslip fixes both problems on Zcash.
> Employers pay their team privately in one shielded transaction, and every payment carries a payslip signed by the employer.
> Workers can then prove their salary with a view-only code that never reveals their personal wallet.

## 3. Live demo (0:40 to 1:40)

**[Employer page. Balance and public stamp visible. Fill in one or two rows, or Import CSV]**

> Here's the employer. I add my team: name, shielded address, amount.

**[Click "Preview payslips"]**

> Each person gets a payslip like this, stamped with the employer's signature.

**[Click "Pay everyone privately". Show the green success box with the transaction ID]**

> One click, and everyone's paid in a single shielded transaction.
> On the public blockchain, nobody can see who got paid or how much.

**[Worker page. Point at the proof code, click "Copy proof code"]**

> Now I'm the worker. I need to prove my income, so I copy my salary proof code.

**[Checker page. Paste the code, click "Check income". Results appear]**

> The landlord pastes it in, and sees my verified salary: who paid me, how much, which month.
> The signature checks out, and the amount paid matches the payslip.

**[Scroll to a "No payslip" or rejected row]**

> Payments without a valid employer signature aren't counted. Fake or copied payslips get rejected.

## 4. Honest privacy (1:40 to 1:55)

**[Scroll to "What this proves / What this does not show"]**

> What the landlord can't see: my personal wallet, my spending, or where I sent my money afterwards.
> We tested that: a full viewing key leaks it, so Payslip only ever uses the incoming key.
> The limit: the code shows everything paid into the salary account, so keep it just for salary.

## 5. Close (1:55 to 2:00)

**[GitHub page: github.com/Bigmanmarsh/payslip]**

> Payslip: get paid privately, and prove it. The code is open source on GitHub.

---

## Before you hit record (checklist)

- [ ] The app is running and open in Chrome at http://localhost:4321
- [ ] Chrome zoom at 110% or 125%, so text is readable (Ctrl and +)
- [ ] Close other tabs, and turn off notifications (Windows: Focus assist → Alarms only)
- [ ] Employer page: one row ready to paste for the live payment, e.g.
      `008, Worker, <Worker's salary address from the Worker page>, 0.03, 2026-10`
- [ ] **Do the live payment at least 2 minutes before you record the checker part.**
      New payments need a block or two before the checker can see them.
      The easiest way: record the Employer part, pause, wait 2 minutes, then record Worker + Checker.
- [ ] Copy the Worker's proof code into Notepad as a backup
- [ ] Quiet room, phone on silent, sit close to the microphone
