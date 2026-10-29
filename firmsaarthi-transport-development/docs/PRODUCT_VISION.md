# Logistrace product vision

Owner: Arjit. Started 25 October 2026. This is an active implementation roadmap, not a claim that every module is already available.

## Product promise

Accepted 26 October programme: start with the simple Initiated → In progress → Complete consignment timeline, optional operational documents and explicit manual/GPS provenance. Supplier assessments are private to each business; future public marketplace ratings require their own completed-trip eligibility and dispute controls. Logistrace support uses a separate, audited, read-only session rather than customer impersonation. See IMPLEMENTATION-2026-10-26.md for delivery and remaining verification.

Latest user expansion, 26 October 2026: evolve both transport supply and shipper demand. Maintain a living [ROADMAP.md](ROADMAP.md), research current transport solutions, implement validated increments every five-hour cycle and publish actual release notes in Settings → What's new. Add document-gated trip stages, a separate shipper portal and load posting, private transporter bidding/award, consent-based KYC and completed-trip truck/transporter ratings. The roadmap defines dependencies and release gates; these future modules are not yet live. Existing finance and transport operations remain the foundation.

Keep the product sober and easy to use, as explicitly requested by the user. Follow [UX_PRINCIPLES.md](UX_PRINCIPLES.md) for task navigation, progressive detail, plain language and phone usability. Every new module must fit the everyday workflow without adding unnecessary screens or approvals.

Run a transport company from booking to delivery, billing, settlement and company profitability. Start with Indian transport agencies using hired trucks; support owned and mixed fleets through explicit cost models rather than charging the same trip twice.

The owner should be able to answer: what is moving, what needs attention, what can be billed, who owes us, whom do we owe, and what did the company earn after all costs?

## Operating model

Delivered vehicle/GPS increment: Tracking now has a sourced vehicle document register (RC, insurance, fitness, permit, PUC), private attachments, manual review history and expiry queue, plus owner-scoped GPS provider connections. The first LocoNav read-only adapter is implemented against official documentation with encrypted tokens and explicit UUID/truck mapping. WheelsEye records onboarding prerequisites until an official contract is obtained. No provider account has been connected; manual sync is available once authorized access is configured. There is no automatic registration lookup, continuous GPS polling or live FASTag/EWB API. See research/gps-provider-connectors.md and research/vehicle-number-lookup.md.

- One isolated company workspace. Owner, Commercial member (existing MEMBER access) and a restricted Dispatcher role are implemented. Dispatcher state omits commercial fields and permits trip planning/progress; financial/staff/document/provider APIs are blocked. Existing roles remain unchanged until owner assignment. Accountant, view-only, employee and branch/assignment capabilities remain planned. See TEAM_ACCESS.md.
- Customer, supplier, driver, vehicle, route and rate masters.
- Enquiry → quote → booking/consignment → trip/vehicle allocation → pickup → in transit → delivered → proof-of-delivery accepted → invoice → partial receipt/reconciliation.
- Hired vehicle purchase cost and supplier settlements; owned vehicle fuel, tolls, driver allowance, maintenance, insurance and depreciation. Commercial responsibility for a cost must be explicit.
- Company expenses: rent, salaries, utilities, software, professional fees, financing, depreciation and taxes. Expense recognition and payment are separate.
- Staff and payroll: staff master, dated salary terms, attendance/leave inputs, advances/recoveries, reimbursements, pay runs, approvals, salary payable, payslips and bank/provider payout reconciliation. See STAFF_AND_AUTOMATION.md for user-requested expansion and examples.
- Receivables/payables, customer/provider advances, bank reconciliation, vouchers, audit history, exports and eventual double-entry journals and period locks.

## Accounting contract

All amounts are integer paise. Cash receipts, customer advances, supplier advances, borrowings and loan principal are not automatically P&L revenue/expenses. Recoverable input tax is separate from recognized expense. GST collections do not become freight revenue.

Current release: a clearly labelled accrual management P&L, using consignment dates as a provisional transport recognition basis. New manual trip/delivery/POD evidence does not automatically change this policy; historical coverage and the business's recognition agreement require a controlled transition. Include every recorded freight amount, supplier freight and supplier other charges. Add invoice extras once from invoice snapshots, on invoice date. Expense vouchers use recognition date regardless of payment state. Show missing provider-cost counts, excluded capital/financing movements, and all assumptions. Do not claim a statutory ledger or audited accounts.

Transport contribution = freight + invoiced extras − hired transport charges − incremental direct costs.
Operating profit = transport contribution + other operating income − overheads.
Profit before tax = operating profit − depreciation − finance costs.
Recorded net profit = profit before tax − recorded income-tax expense.

No inferred depreciation, interest, payroll or income tax: show that these depend on complete entries. Refund/reversal and credit-note support must preserve source history. Invoice tax policy needs independent GTA/RCM/FCM review; preserve issued invoices during any migration.

## Milestones and acceptance gates

1. **Company finance foundation (now):** expense/income vouchers, non-P&L categories, recoverable tax, draft/post/void lifecycle, direct-cost links, company report with dates/category/month drill-down and CSV/PDF export. Owner access only initially. Validate missing costs, negative margins, advances, duplicate costs, years, tenant isolation, voids and report totals.
2. **Integration foundation:** separate GPS positions, FASTag financial transactions, FASTag toll sightings and e-way documents. Imported data remains labelled as imported. Provider metadata, timestamps, freshness, external IDs, idempotency, tenant scope and provenance are required. No synthetic live connections.
3. **Collections and supplier settlements:** partial receipts/payments, allocation, credit/debit notes, customer/provider statements, due dates and ageing. Match invoice amounts to invoices without double recognizing consignment revenue.
4. **Operational trip lifecycle:** owned/hired vehicle selection, multi-consignment trips, milestones, delivery evidence, exceptions, detention and unbilled-delivery queue. Replace provisional recognition dates only after controlled migration.
5. **Live GPS adapter:** select a documented provider using an existing customer account or compatible device backend. Vehicle mapping, server-side credentials, polling/webhooks, location history, freshness, exception alerts and access-limited customer links. Verify against provider sandbox or authorized real vehicles.
6. **E-way bill adapter:** select approved GSP/ASP or eligible NIC direct access; sandbox credential onboarding, transporter/GSTIN mapping, validation and Part-B updates. Explicit user submission, retry/reconciliation and audit records. Never assume that registration equals API entitlement.
7. **FASTag adapter:** issuer statements/API for monetary toll reconciliation; separately approved ULIP/IHMCL sightings where available. Do not market sightings as continuous GPS. Deduplicate before posting toll costs; match truck/trip and record who bears cost.
8. **Accounting close:** balanced journals, chart of accounts, opening balances, bank/cash books, advances and deposits, fixed assets/depreciation, cost centres, period locks, trial balance and balance sheet. Validate with accountant-selected real cases.
9. **Commercial launch:** multiple independent company provisioning, onboarding/import templates, plan limits and billing, recovery and restore exercises, help, measured pilot outcomes and support process. Test with three paying transport businesses through one complete billing cycle.
10. **Staff/payroll and back-office automation (user-added scope):** employee and salary tracking first; approved monthly pay runs and advances/reimbursements next; provider-integrated payouts after sandbox access and authorized account setup. Preparation, calculation, recording payment and sending funds are separate actions. Match payroll accruals to existing staff vouchers so P&L does not double count. Detailed implementation order is in STAFF_AND_AUTOMATION.md.

Current staff increment: employee/term snapshots, reviewed regular monthly payroll, one-time gross-plus-employer-cost expense, dated employee advances/recoveries, partial manual external payment recording, payroll CSV and salary statements are implemented. Existing staff vouchers require a non-duplication review before posting. Statutory engines, attendance/prorating, reimbursements, arrears, authority remittance ledgers, provider payouts and scheduled preparation remain future work.

Current supplier increment: audited opening payment history, allocated advances/partial supplier payments, immutable financial details, reasoned voids, owner cost/due-date editing and balance/ageing summaries are implemented. Settlements leave transport cost recognition unchanged. Unknown dates and excess opening payments remain explicit. Truck Provider Ledger keeps its selected-year scope.

The new Balances & Statements workspace implements stable customer/supplier accounts, reviewed exact-source-name links, future exact-name account inheritance, current statements across all recorded years, customer due-term history, ageing, CSV payment history and PDF balances. Original invoice names/snapshots remain intact. Unlinked names remain visible. Account mapping corrections, credit/refund/TDS, unallocated advances, cross-document allocation and historical as-of accounting remain planned. All-years receivables cover billed invoice balances, not unbilled freight.

## Integration delivery rules

Owner-only private POD attachments, file-specific manual review, replacement and correction history are implemented in Trips. Owners can now choose immutable required-file POD policy on a new trip, enforcing uploaded acceptance before closing; see TRIP_DOCUMENTS.md. Business-default policies, placement/loading/arrival evidence, delegated reviewers and cross-company file sharing remain planned. Existing reference-only history and accounting recognition are unchanged.

The first hired-trip workflow adds planning/allocation, departure, partial delivery, owner-reviewed POD references, exceptions/resolutions, controlled closing/corrections and an accepted-POD/unbilled queue under Consignments → Trips. It retains manual provenance and leaves financial recognition unchanged. Detailed scope and remaining operational work are in [TRIP_LIFECYCLE.md](TRIP_LIFECYCLE.md).

Provider agreements, approval, credentials, static egress/IP requirements and metered fees are real dependencies. Record them as prerequisites; never pretend a local adapter is a connected government service. No purchasing or credential collection through ordinary chat messages. Use server-side secret storage and authorized accounts. Validate provider payloads and signatures, bound retries, redact logs, deduplicate deliveries, and preserve source references.

## Product success measures

Days from delivery to invoice; unbilled completed freight; overdue receivables; unresolved provider balances; trips with complete costs; imported toll match rate; age of last GPS observation; document expiry exceptions; owner time to produce monthly company P&L; paying companies retained through a billing cycle.

## Working cadence

A thread automation returns every 15 minutes (owner changed the cadence on 27 October 2026). Each run reads PROGRESS.md, researches only unresolved questions, implements the highest priority usable increment, verifies changes, publishes through Sites when checks pass, and records the handoff. Platform quotas and local machine availability constrain execution; no guarantee of running at the instant limits reset or publishing every interval. Publish validated updates to the existing project connected to transport.firmsaarthi.com; see CUSTOM-DOMAIN.md for activation status. Never spend reset credits without a separate explicit request.
