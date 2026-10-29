# Staff, payroll and back-office automation

User scope expansion, 25 October 2026: staff management, salary/payment tracking, salary payout integration and automation. Version 9 implements the owner-only employee directory and dated salary terms. Version 10 adds reviewed monthly pay runs, one-time expense posting, advances/recoveries, partial manual salary payment records, CSV registers and salary statement PDFs. Statutory calculation, scheduled preparation and live disbursement remain planned. Monthly salary references do not themselves post expenses or payments.

## Implemented payroll workflow

- Prepare one regular draft per company/month for employees whose employment overlaps the month, using applicable salary terms. Every line keeps an employee/term snapshot. No attendance or partial-month prorating is inferred; the owner reviews actual earned gross, employee withholding, additional employer costs and advance recovery. Zero gross is allowed for a reviewed unpaid month.
- Only a completed month can be posted. All lines must be reviewed; a version check prevents stale edits/posting. Posting atomically creates one linked staff expense equal to gross plus employer costs. Existing manually posted staff vouchers are shown and require an explicit non-duplication review; duplicate salary vouchers must be voided before posting. They are not automatically migrated or matched.
- An employee advance is a receivable. Dated cash repayments and posted payroll recoveries reduce its balance. Daily running-balance checks prevent a later advance from funding an earlier recovery, including corrections to an advance already recovered.
- Record an actual external salary transfer with date, amount, method and reference; partial payments and idempotent retries are supported. Overpayment is rejected. This records the owner's statement of a completed payment; it is not bank verification or a payout API.
- Posted lines are immutable. Corrections retain void reasons and history; active salary payment records must be corrected before a payroll run can be voided. Voiding the run removes its expense and advance recoveries together. It never reverses a real bank transfer.
- Payroll CSV and salary statement PDFs show reviewed inputs, net salary, recorded paid and remaining. These are management records, not statutory filings. Withholding/employer obligations are visible components; authority-specific liability settlement and statutory reporting are not implemented. No employee bank details are collected.

Service tests cover accounting arithmetic, missing salary terms, tenant/role restrictions, stale edits, idempotency, partial/excess payment, advance timing, immutable history, voids and backup inclusion. Real local HTTP and desktop/mobile browser checks use synthetic data only.

## Transport-specific staff lifecycle

Employee/contractor record → dated compensation terms → attendance/leave and approved variable earnings → monthly payroll draft → review/approval → payroll posting → authorized payout request → provider/bank reconciliation → employee payslip and balance history.

Separate staff records from application logins. A clerk or driver may be paid without using the app; a login must not automatically become a payroll employee. Distinguish employees from hired-truck vendors and contract drivers. Do not pay a hired provider's driver independently unless the company's agreement makes that its obligation.

## Product examples

| Module | Example workflow | Financial effect |
|---|---|---|
| Staff directory | Office staff, dispatcher, accountant, branch, joining/leaving date, compensation history | Master data, no automatic expense |
| Attendance and leave | Import monthly attendance; resolve disputed days; approve overtime before payroll lock | Inputs to a reviewed pay run, not an automatic punitive deduction |
| Monthly payroll | Scheduled draft combines fixed earnings, approved overtime/incentives and configured deductions | Recognize salary for its earned period, independently of payment |
| Salary advances | Record employee advance, approved recovery schedule, outstanding balance and final settlement | Advance is an employee receivable; recovery does not reduce gross staff expense |
| Reimbursements | Staff submits a loading receipt; manager approves; payroll or a separate payout settles it | Record underlying expense once, settle liability once |
| Salary disbursement | Approved employee amounts form bank advice or provider payout batch | Clear salary payable only on reconciled payment; pending/reversed is not paid |
| Employee self service | Own payslips, attendance corrections, claims and advance balance | Employee-scoped access; no coworkers' salaries |
| Recurring office bills | Rent, software, utilities and supplier invoices create due-date tasks/drafts | Recognize each monthly service once; later bank debit is settlement |
| Supplier settlements | Delivery evidence accepted, provider balance reconciled, payment proposal approved | Provider payable cleared; no second transport cost |
| Customer collections | Due dates, consented reminders, payment links and bank matching | Clear receivables without duplicating freight income |
| Petty cash | Office/driver advance is reconciled to supported spend and unused money | Advance versus expense remains explicit |
| Incentives | Approved dispatcher commission tied to a configured collected-margin rule | Explainable compensation with reversal handling, not an unexplained score |
| Renewals and obligations | Insurance, permits, contract expiry and employee-document reminders | Draft relevant accrual/payment obligation when warranted |
| Cash planning | Next payroll, rent and supplier payments compared with expected collections | Forecast distinct from booked P&L and actual bank balances |
| Month-end close | Uncosted trips, unpaid salaries, unmatched debits and unapproved claims queue | Owner/accountant clears exceptions before locking the period |

## Salary accounting contract

- Payroll gross earnings, employee deductions/withholdings, employer contributions, employee-advance recoveries, reimbursements and net payout are separate components. Applicable statutory policy is configured and versioned; do not hardcode unverified national/state rates or infer employee status.
- Salary expense is based on earned gross compensation plus applicable employer costs. Employee withholdings are liabilities, not a discount on compensation cost. Loan/advance recovery reduces an employee receivable, not salary expense.
- Reimbursements must reference the originating expense, preventing a second posting through payroll; this workflow remains planned. Before posting payroll for a month with existing staff vouchers, review and void any duplicate salary entries. No automatic matching or rewriting of historical vouchers is performed.
- Payroll month/employee/regular-run uniqueness, effective-dated revisions and snapshots prevent duplicate regular accruals. Off-cycle runs and explicit arrears remain planned. Paid payroll cannot be silently edited; corrections preserve history.
- Payout request accepted, queued, processing, successful, failed, reversed and unknown outcomes stay distinct. A timeout requires status reconciliation before retrying. Stable payout keys, signature-verified webhooks, account scope and audit events are required.
- Bank advice/export or a provider acknowledgement does not by itself prove salary settlement. Record transaction reference, amount, date and evidence. Reject excess allocation and preserve partial payment history.

Illustration (amounts chosen only to explain accounting): gross earnings INR 30,000, employer cost INR 2,000, employee deductions INR 3,000, advance recovery INR 2,000 and reimbursement INR 1,000 result in a net employee payment of INR 26,000. Staff compensation cost is INR 32,000; the reimbursement is categorized separately and recognized only once. These are not statutory rates.

## Automation model

Automate preparation, validation, reminders and reconciliation first. For a pilot, payroll is prepared on a configurable monthly date; designated users review changes and an owner approves the immutable batch. Actual money movement remains in an explicitly authorized bank/provider flow. This user request authorizes designing/building payment capability, not transferring anyone's salary now.

Later scheduled execution may be enabled per company with explicit mandate, beneficiary verification, ceilings and approval rules that also operate at the provider. Payroll approval and payout authorization must refer to the exact employee/amount/bank-detail versions. Changing beneficiary or amount invalidates approval. No plaintext bank credentials in logs, exports or ordinary chat. Prefer provider beneficiary references and masked display; verify encrypted secret-storage design before collecting bank details.

## Provider options and verified scope

- [RazorpayX Payouts](https://razorpay.com/x/payouts/): vendor documents APIs, batch approvals, account verification and status webhooks. Candidate disbursement rail; requires merchant eligibility/onboarding and a confirmed partner/tenant model. Product page is not proof that Logistrace has credentials or embedded multi-tenant entitlement. Do not use wallet-specific API limits for salary bank payouts.
- [Cashfree Payouts](https://www.cashfree.com/payouts/): vendor documents payout infrastructure, scheduling and monitoring. Candidate alternative after checking current API contract, approval controls, supported accounts and commercial terms. No integration activated.
- [Zoho Payroll pay runs](https://www.zoho.com/in/payroll/help/employer/pay-runs/): benchmark separates input/review, approval, bank advice/direct-deposit workflows, selective payments and payroll journals. Candidate payroll partner subject to API and commercial verification, not a claim of available embedded payroll access.
- [Zoho employee portal](https://www.zoho.com/in/payroll/help/employee/basics/): benchmark for self-service payslips, claims and salary views. Implement only employee-scoped access in Logistrace.

Research checked 25 October 2026 using official vendor pages. No pricing, compliance coverage or integration entitlement was assumed.

## Implementation order and release gates

1. Employee masters and salary tracking, effective-dated terms, monthly earnings/deductions and advance ledger. Avoid collecting full bank details until payment integration design requires them. Gate: tenant/employee privacy, date validity, arithmetic and historical terms tests.
2. Draft/review/approve/post pay runs, salary payable and P&L linkage, adjustment history, payslips and bank advice. Gate: no duplicate salary expense, advance recovery accounting, unpaid/partial salary, arrears and change-after-approval tests.
3. Attendance/reimbursement import and staff self-service. Gate: reviewable corrections, no automated adverse employment decisions, per-employee record access.
4. Sandbox payout adapter after provider selection, beneficiary workflow and commercial access. Gate: duplicate prevention, signed webhook verification, delayed/out-of-order statuses, partial batch failures, reversal/unknown outcome handling and reconciliation.
5. Production payout enablement only after authorized account setup and approval controls; scheduled execution is a separate per-company feature. Gate: reconcile approved payroll, provider events, payable balances and actual transfers without duplicate expense/payment.
