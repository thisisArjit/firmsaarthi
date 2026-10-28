# Inventory roadmap — 28 October 2026

## Current state

Local I1 stock core implemented and9 actual Node tests pass. No hosted app, UI, signup or API exists. No published release or domain route. No existing inventory Sites project was found in the current owner's complete six-item Site listing; checked before starting this separate checkout.

Cycle update: runtime-neutral validation and asynchronous D1-binding service are implemented locally;16 tests pass. Adjustment version checks now also run inside the SQL insert trigger, closing the read/write race that a remote adapter would otherwise introduce. Actual D1 staging, versioned migrations, authenticated product boundary and UI remain unfinished. The original9-test observation above is historical.

## Finish I1 before broadening

1. Domain extraction and D1 service adapter are locally implemented. Next add versioned fresh-schema deployment migrations and validate the actual D1 runtime on private staging, including synchronized issues, duplicate intents and stale adjustments. Local SQLite contract/concurrency tests are supporting evidence only.
2. Design product authentication with stable identities and memberships. No Transport identity auto-access, no email-as-tenant authorization, no unauthenticated provisioning, no public actor/org request arguments. Select free supported provider flow, keep credentials separate and obtain any required action-time approvals.
3. Add service/API/UI: owner creates SKU/base unit/warehouse; owner or operator receives/issues; owner reviews reasoned delta adjustment and explicit reversal; viewer sees balance/history. Preserve unfinished forms on refresh and expose conflicts with current balance/version. Scoped history and source actions explain every balance. Do not add user-selected historical posting dates in I1.
4. Provision one private Inventory staging Site with isolated storage only after source/manifest setup; preserve all current product projects. Implement an explicit same-source release fingerprint/gate, then desktop/phone hosted E2E for happy paths, duplicate/concurrent/stale inputs, tenant/role/privacy boundaries, quantity sum/invariants and recovery. Never report this local harness as hosted tests.
5. Only after passing, create/publish intended public offering, configure inventory.firmsaarthi.com through authorized DNS and verify HTTPS/routing. Push sanitized source/docs under a distinct inventory folder of existing private GitHub repository. No automatic public deployment on push. Update homepage only after actual usable publication.

## Later complete workflows

I2 purchasing/partial receiving/returns with source order links and no duplicated receipt. I3 sales/reservation/available quantities/fulfilment/returns. I4 balanced transfers and physical counts/reorder. I5 serial/batch/expiry/barcodes. I6 explicit valuation/import/report policy. I7 consented integrations and tenant mapping. No financial/tax posting inferred from stock.

## Migration checkpoint — 28 October 2026
Canonical numbered initial migration and atomic local version/checksum runner implemented;21 tests pass. See MIGRATIONS.md. No hosted execution or public release. Next highest priority remains deliberate Inventory-only auth and a complete Items/Warehouses/Stock/History API/UI; then one isolated private Site and same-source hosted matrix. No new product beyond Inventory.

## Identity/API checkpoint — 29 October 2026
Native Sites scoped-identity mapping and stock Request/Response handler implemented internally;25 local tests pass. No raw client identity headers/email/Transport cookies accepted; membership must already exist and multiple memberships deny until reviewed selection is implemented. Next wire the native server helper and deliberate separate Inventory workspace creation into the supported starter, build Items/Warehouses/Stock/History UI, then private isolated hosted acceptance. User-facing login options require supported capability confirmation. Do not scaffold custom OAuth/session infrastructure or issue real access from test helpers.
