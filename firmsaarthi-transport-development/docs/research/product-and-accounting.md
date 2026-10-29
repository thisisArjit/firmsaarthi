# Logistrace product and accounting research

Research date: 25 October 2026. Scope: primary-source market benchmark, management accounting design, delivery roadmap and acceptance criteria. This is product research, not statutory accounting certification. Recommendations below are proposed product decisions; vendor capabilities are claims on the vendors' own pages.

## Product decision

Build Logistrace as the operational and financial workspace for Indian road-freight businesses: booking → trip → execution evidence → customer billing → receipts → provider/driver settlement → reconciled management P&L. Serve transport agencies using hired vehicles first, while explicitly modelling owned vehicles so the product can expand without mixing their cost models.

The buyer is the owner; the daily users are dispatch, billing and accounts staff. The first outcome to prove is a month-end statement whose amounts can be traced to actual freight, supported costs and office overheads, with missing information visible. Tracking and compliance integrations should enrich those records rather than create disconnected dashboards.

## Primary-source benchmark

| Source | Finding | Consequence for Logistrace |
|---|---|---|
| [Fleetx consignment management](https://www.fleetx.ai/consignment-management) | Vendor describes consignment booking, customer advances and bills, trip-linked expenses, settlements, tracking and electronic delivery evidence. | Consignments alone are insufficient. Separate the commercial consignment from the physical trip and attach documents and costs to both where appropriate. |
| [Fleetx transport ERP](https://www.fleetx.ai/transporter-erp) | Vendor positions a broad suite around dispatch, billing, settlements, maintenance, compliance and trip/route/asset P&L. | The proposed vision is an established category. Differentiate through trusted numbers, onboarding and a simpler daily workflow rather than a longer feature list. |
| [NPCI NETC overview](https://www.npci.org.in/product/netc/about-netc) and [NETC product booklet](https://www.npci.org.in/PDF/npci/netc/Product-Booklet.pdf) | FASTag is a toll-payment mechanism linked to a vehicle and account; issuers manage customers and transactions within the NETC participant ecosystem. | Obtain an authorised issuer/provider feed for balances and transactions. Toll passages are observations, not continuous truck GPS. A wallet recharge must remain distinct from toll usage. |

Do not use similarly named European FleetX products as evidence for Indian Fleetx; they are different product sites. No independent price, ROI or demand claim has been verified here.

## Existing source assessment

Reviewed `SETUP.md`, `lib/service.ts` and `lib/domain.ts` in the current repository. Existing records include consignments, invoice snapshots, provider freight/charges, customer and provider advances, an invoice paid flag, workspace membership and audit events. Integer paise, tenant-scoped service queries, batch writes and preserved invoice revisions provide useful foundations.

Material gaps:

- No independent trips, trip completion/recognition date, expense register or full general ledger.
- No partial customer-receipt allocations or defensible opening receivable balances; the paid flag cannot reconstruct cash history.
- Provider settlement combines amounts into mutable consignment fields rather than individual transactions and adjustments.
- Freight minus provider freight is a contribution estimate; it cannot establish company net profit.
- `invoiceTotals()` currently subtracts customer advances before applying tax and stores a remaining invoice total. A cash advance must not silently reduce earned revenue. Preserve legacy invoices and isolate their legacy tax rule from new accounting; do not retrospectively rewrite issued documents.
- Customer and provider names are text fields, so stable party IDs and controlled duplicate merging are needed before reliable ageing and integrations.
- No production credentials, contracts or actual integration connectivity were verified by this research task.

## Accounting principles and source basis

[ICAI Guidance Note on Accrual Basis of Accounting](https://kb.icai.org/pdfs/PDFFile6659b4592b2f04.12489462.pdf) describes revenues and costs in the periods earned/incurred rather than received/paid. Its applicability discussion distinguishes accounting frameworks. Product implication: keep effective dates and settlement dates separately, and have the entity's accountant determine its applicable framework and policies.

[ICAI AS 9, paragraph 12](https://indasaccess.icai.org/Volume-III/AS/asb.html?a=110) discusses completed-service and proportionate-completion methods for service revenue. Product implication: store service dates and completion evidence, allow a documented period-end treatment for in-transit services, and never present invoice date as universally equivalent to earned date.

[IFRS 15, paragraphs 47 and 106](https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2022/issued/part-a/ifrs-15-revenue-from-contracts-with-customers.pdf?bypass=on) distinguishes consideration from amounts collected on behalf of third parties and treats payments before performance as contract liabilities. Product implication: separate applicable GST liabilities and customer advances from earned freight. This reference supports principles, not an assertion that IFRS 15 governs every Indian transport business. The official PDF may require an IFRS subscription; an official standards-body implementation is accessible through [XRB NZ IFRS 15](https://standards.xrb.govt.nz/standards-navigator/nz-ifrs-15/).

[IFRS Foundation's IFRS 15 implementation review, section 5](https://www.ifrs.org/content/dam/ifrs/project/pir-ifrs-15/rfi-iasb-2023-4-pir-ifrs-15.pdf) distinguishes a principal providing a service from an agent arranging another party's service. Product implication: hired-truck operations do not automatically imply net commission revenue. Store the business's approved gross-versus-net policy and do not infer it from vehicle ownership.

These references justify the separation of earnings, costs and cash. Tax rate, GTA reverse/forward charge, input-credit eligibility, e-invoice applicability, TDS and statutory presentation need a separately verified India tax specification and business policy configuration.

## Proposed P&L contract

The screen must state period, basis, recognition policy, included entities/branches, currency, completeness and last refresh. Call an early report **Management P&L — provisional** until the required evidence and reconciliation exist.

| Section | Proposed lines |
|---|---|
| Earned transport revenue | Freight, approved detention/handling recoveries and other earned transport charges; credit adjustments; GST collected separately |
| Direct transport cost | Hired-provider cost OR owned-fleet fuel, toll, driver trip costs and relevant running costs; loading/unloading and other attributable costs |
| Transport contribution | Earned transport revenue minus direct transport costs |
| Office/operating overheads | Rent, office salaries, utilities, software, insurance and other operating costs, recognised for the period they relate to |
| Operating result before depreciation/finance | Contribution minus operating overheads; expose the exact included heads |
| Additional recognised items | Depreciation/amortisation, finance cost, other income/expense and applicable period tax expense when supported |
| Management net result | Full recognised income less full recognised expenses; otherwise label the subtotal precisely and expose exclusions |

Financial modelling rules proposed for implementation:

1. Customer receipts and advances clear liabilities/receivables; they do not create a second freight sale. Provider advances clear advances/payables; they do not create a second transport cost.
2. A toll import creates or proposes one cost; FASTag recharge is a wallet transfer/prepayment. A later toll reversal links to the original transaction. Never expense recharge plus each deduction.
3. A hired-provider bill can include fuel/toll. Set who bears each cost and avoid adding third-party toll observations again when the provider bears the cost.
4. A vendor expense can be partly paid or unpaid. Store recognition date, payment date and amount separately. Receipt photo, supplier, category, branch, trip, taxable base, tax and credit eligibility are separate fields.
5. Deposits, truck purchases, loan principal, drawings and bank transfers must not be entered through ordinary P&L expense categories. Introduce asset/liability/owner transactions as the accounting model matures.
6. Office salaries stay overhead unless a documented allocation assigns them to trips. Allocations move existing cost between views; they never create another company expense.
7. Distinguish estimated, entered, approved, posted and reconciled values. Show missing provider cost as unknown, never silently zero.
8. Every amount in the report drills down to source record, attachment and change history. Closed periods use reversals/adjustments with an actor and reason; no silent edits.

An initial expense register plus an accrual-style operational report is a useful first slice. It is not a substitute for double-entry books, opening balances, reconciliations and period-end adjustments.

## Illustrative acceptance fixture (INR, excluding tax)

An earned hired-truck consignment has customer freight 100,000 and provider cost 75,000. Customer advance received 20,000 and provider advance paid 30,000. Office rent for the month is 8,000 and staff cost 10,000. The result is revenue 100,000, direct cost 75,000, contribution 25,000 and operating surplus before depreciation/finance/tax 7,000. Neither advance changes these results. Later settlement of the remaining receivable/payable does not change them either.

The same amounts remain provisional if delivery/recognition evidence or period costs are missing. An uncompleted trip must follow the business's documented revenue-recognition policy; booking it does not automatically earn the freight.

## Delivery milestones and release gates

### M0 — Preserve data and establish policy

Document the live schema and business rules, preserve source and schema migrations, and test an export/restore with private attachments. Record one transport agency's month-end sample, opening balances and own/hired/agency revenue policy. Gate: existing tenant isolation and billing tests pass, legacy invoices are unchanged, and a reviewed reconciliation fixture is saved.

### M1 — Management finance foundation (first implementation priority)

Add tenant-scoped dated expenses, categories, counterparty/document reference, cost responsibility, trip/consignment link and payment status; allow office rent and staff expense. Add P&L contribution/overhead drill-down, CSV export and completeness indicators. Gate: the illustrative fixture passes; advances never reduce revenue; missing costs are highlighted; other workspace data cannot be read/changed; amounts use paise and valid calendar dates. Label the report provisional and state its source-date basis where completion dates do not yet exist.

### M2 — Execution and evidence

Introduce vehicle/driver/provider masters, independent trips and trip-consignment allocation, dispatch/status events, delivery evidence and unbilled-ready queue. Support hired versus owned responsibility and actual versus estimated costs. Gate: split consignments/multiple consignments per trip do not double-count revenue/cost; duplicate completion events are harmless; evidence access is tenant authorised.

### M3 — Ledgers and reliable close

Implement journal-backed AR/AP, allocations for partial receipts/payments, credit notes, balances, bank/cash accounts, accrual/prepayment adjustments and locked periods. Define posting events and reconciliation to operational subledgers; require balanced postings. Gate: trial balance balances, receipts can span invoices without over-allocation, late adjustments are auditable, and P&L ties to posted ledger totals. Add opening-balance migration with explicit reconciliation.

### M4 — Connected visibility and toll reconciliation

Integrate an authorised GPS/telematics provider; import authorised FASTag transaction data and bank statements first, then automate feeds. Normalise timestamps/time zones and vehicle IDs, record provenance and fetch time, flag stale positions and overlapping trips, and queue ambiguous matches. Gate: replay/duplicate events do not duplicate costs; wrong-workspace/vehicle data is rejected; recharge, deduction and reversal are distinguished; a failed feed is visibly stale. Never label a toll-plaza ping as live GPS.

### M5 — E-way bill and compliance execution

Use approved NIC/GSP/partner access with customer credentials and supported permissions. Add validated draft, review, submit, status lookup, vehicle/transporter updates and valid extension/cancellation workflows; distinguish e-way bill from e-invoice and transport billing. Gate: official sandbox end-to-end test, external reference and response log, duplicate-submit prevention, safe timeout reconciliation and explicit authoritative status. No production activation without real authorised access and approved policy.

### M6 — Commercial pilot and fleet depth

Add maintenance/insurance/permits, fuel and odometer controls, monthly allocations, customer portal and accounting exports according to pilot findings. Pilot three independent businesses through a close, with at least one hired-fleet and one owned-fleet workflow before expanding claims. Proposed measures: time from delivery evidence to invoice, unbilled delivered value, unresolved cost value, overdue balances, close time and report reconciliation difference. Pricing and targets require customer validation.

## Operational risks and PM decisions

- Prioritise finance semantics before a net-profit headline: incomplete transport costs can overstate profit dramatically.
- Allow statement/CSV imports and manual source-backed records while external access is being arranged. Clearly label origin and connectivity; manual entry is not a live integration.
- Paid APIs, consent, provider coverage, webhook authentication, credentials and renewal costs are commercial dependencies, not just coding tasks.
- Do not promise all-India GPS from a vehicle registration number, bank-wide FASTag balances, automatic statutory tax correctness or unsupported e-way-bill auto-extension.
- Build owner/accounts/dispatcher/driver permissions around the workflow; driver location and bank data require least-privilege access and retention controls.
- Preserve source-event IDs, payload hashes, processing status, retry history and correlation IDs. Keep integration credentials encrypted server-side and redact sensitive data from logs/exports.
- Maintain a durable backlog and progress log so scheduled work can resume from evidence. A five-hour schedule cannot guarantee execution during account rate limits; each run should stop cleanly with a checkpoint.

