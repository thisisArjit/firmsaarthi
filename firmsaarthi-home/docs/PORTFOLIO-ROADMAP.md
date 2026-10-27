# FirmSaarthi portfolio roadmap

Owner direction: 28 October 2026. Review strong products and build useful business solutions every six hours. Existing automation `build-logistrace-end-to-end` was updated in place to this cadence; no duplicate competing builder. Inventory is the next new offering, targeting inventory.firmsaarthi.com after implementation and validation. It is not live yet.

Operational identity: firmsaarthi@gmail.com for new business operations and public support/activation. Read OPERATIONS.md before any account or provider setup. Existing service ownership and platform access require a separate verified migration.

## Current portfolio

| Offering | State | Source | Public address |
| --- | --- | --- | --- |
| FirmSaarthi brand | Published, separate static homepage | ../firmsaarthi-home | www.firmsaarthi.com and firmsaarthi.com |
| Transport & Logistics | Live release43; additional stage-document workflows remain unpublished | ../tms-web, stable release ../tms-google-release; isolated stage ../tms-stage | transport.firmsaarthi.com |
| Inventory | Research and acceptance plan prepared; no app, tenant or domain route created | intended ../firmsaarthi-inventory; discover existing identity before creation | intended inventory.firmsaarthi.com |
| Purchasing, sales/CRM, service/job management, expenses/accounts, staff | Discovery candidates, not released products | Not started | No public routing yet |

## Every six-hour cycle

1. Read this file, product checkpoints, Git changes and release/environment manifests. Reconcile unfinished work and avoid overlapping builds.
2. Review the selected domain's leading products using official documentation; record date, direct source, documented feature, user job, our gap and a concrete decision. Read actual existing code before declaring a gap. Revisit other candidate areas in rotation, without starting empty apps for each.
3. Prioritize by customer value, frequency, risk and dependencies. Keep one new product in active construction, preserve transport maintenance and finish working vertical workflows before broad expansion.
4. Implement a complete safe slice with service/API/UI and meaningful tests. Free services only; no card, purchase or billing activation. Record unavailable provider/verification requirements and continue independent work.
5. Exercise the same source on isolated private hosted staging, desktop and phone. Include role/tenant boundaries, duplicate/concurrent writes, errors/recovery and domain-specific invariants. Missing/failed/stale checks block production. For Transport retain its exact docs/STAGING.md fingerprint gate.
6. Publish validated usable increments via Sites; verify intended subdomain DNS/HTTPS, preserve other products/mail/OAuth/DNS, and push sanitized source/docs into distinct folders of private thisisArjit/logistrace. Never enable automatic production deployment from GitHub push. Update the public homepage only when an offering is actually live.
7. Save exact source/version/deployment, actual tests, limitations and precise next steps. Send substantive findings/releases/blockers; stay quiet if state is unchanged. Scheduled execution depends on the host being available and remaining usage; it is not a guarantee of completion every cycle.

## Inventory delivery sequence

| Priority | Complete workflow | Acceptance boundary |
| --- | --- | --- |
| I1 | Workspace, SKU/items, units, warehouse, receive/issue/adjust/reverse and stock history | Exact validated quantities, transactional append-only posted movements, explicit reasoned reversals, no duplicate posting, concurrent issue protection, no cross-tenant reads/writes, shared views refresh without losing drafts. Default prevent negative stock. No financial posting implied. |
| I2 | Purchasing and receiving | Draft/order/partial receipt/return quantities reconcile; suppliers and received stock stay connected; cancellations preserve history and cannot duplicate receipts. |
| I3 | Sales, reservation and fulfilment | Clearly separate on-hand, reserved and available quantities; release reservations safely; partial dispatch/return and insufficient-stock handling tested. No duplicate invoice/revenue posting. |
| I4 | Warehouse transfers, counts and reorder queue | Explicit source/destination/in-transit handling; balanced transfer legs and count variances; no silent stock edits. |
| I5 | Traceability and operational efficiency | Serials, lots/batches, expiry and barcode flows added with uniqueness, lifecycle and device/manual fallback tests. |
| I6 | Valuation, reports and imports | Explicit costing policy, dated adjustments/reversals, reconciliation, exports, validated import preview and recovery; do not claim statutory compliance or general-ledger integration until delivered. |
| I7 | Controlled integrations and connected products | Credentials/consent, idempotent inbound events, retries, reconciliation, permissions and cross-product tenant mapping defined and validated first. |

## First implementation checkpoint

Next run should inspect current projects and instructions, deepen stock-quantity/movement/role requirements from the official research, then implement I1 as a bounded functioning inventory foundation with isolated storage and private staging. Reserve invoice/accounting integration and warehouse-to-transport automation until their contracts exist. Do not provision public inventory DNS or promote inventory as available merely to show progress. No inventory customer records, credentials or app exist from this planning turn. Current research evidence is in research/business-products.md.
