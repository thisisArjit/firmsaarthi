Latest29October2026,15:09IST: explicit Inventory-only workspace creation service/API and additive migration0002 implemented locally.45 local tests pass, including independent concurrent onboarding, rollback, revoked-owner protection and populated-schema upgrade. Native server helper/onboarding UI/private hosted gate are still pending; no Inventory Site or public offering. Read docs/WORKSPACE-CHECKPOINT.md first. Transport45 with OTP and live Razorpay remains unchanged.

Latest 29 October 2026,13:05IST: local same-tab reload recovery now preserves the original reviewed stock request and count version, with verified account scope, explicit retry and fail-closed storage handling.37 local tests pass; synthetic desktop loopback recovery/history verified. Read docs/RECOVERY-CHECKPOINT.md. Native identity/workspace integration and private hosted desktop/phone gates still block publication. Transport44/payment release is complete; do not repeat that old blocker.

# FirmSaarthi Inventory

Local stock-ledger foundation, not a hosted or available product. Target inventory.firmsaarthi.com remains unconfigured. Do not advertise it on the public homepage yet.

Latest29October cycle: local Stock/Items/Warehouses/movement-history UI and reviewed posting/reversal flows now exist in public/.31 local tests pass; a synthetic loopback desktop CUA walkthrough exercised master creation, draft-preserving refresh, receive/issue/history/reversal. Native auth entrypoint, workspace creation, hosted staging/phone acceptance and public release remain pending. Read docs/UI-CHECKPOINT.md before continuing; the ignored synthetic preview server must never become a production identity adapter. Earlier no-UI observations below are historical.

Run Node22.13+ (current machine Node24):

    node --test tests/*.test.mjs

No dependencies, provider setup, billing, customer records or external calls are required. Tests use synthetic in-memory SQLite and one temporary file deleted after the concurrency test.

Implemented internally: workspace-scoped SKU/items/base units, warehouses, owner/operator/viewer permissions, exact quantities, receive/issue/reasoned adjustment and one explicit reversal, immutable posted movement rows, duplicate request protection, balance versions, negative-stock prevention and movement history. Quantities are integer millionths; each/box allow whole units and kg/litre/metre permit3 decimal places. This is quantity tracking only: no valuation, invoicing, financial posting or tax compliance.

The current Stock class uses Node SQLite as a reference engine and local invariant harness. It is not deployable to Cloudflare Workers as-is. Port the database adapter to supported Sites D1 prepared statements and transactional batch/SQL guards, add deliberately isolated product authentication, API and sober phone UI, then provision private hosted staging. Do not expose the current constructor/provisioning functions directly to requests: their org/user arguments are internal trusted identities, not authentication. No Transport account or email grants Inventory access.

`lib/d1-stock.mjs` now provides an asynchronous D1 binding adapter with no Node imports. It shares runtime-neutral validation, uses a primary-first session and an atomic SQL batch for posting/replay, and checks adjustment versions and membership at the actual database write. History is cursor-paged.16 local tests pass, including contract tests over SQLite and synchronized independent-connection issue/replay races. This is not actual hosted D1 or browser verification. No Inventory authentication, API, UI, Site or public DNS exists yet. The changed bootstrap schema is for fresh synthetic databases only; versioned deployment migrations must be added before hosted storage or any existing database upgrade.

See docs/PROGRESS.md, docs/ROADMAP.md and docs/RESEARCH.md before continuing. No Sites ID is registered. Sanitized source is backed up under firmsaarthi-inventory/ on the inventory-foundation branch of the existing private thisisArjit/logistrace repository. Re-discover hosted projects before creation so a later run cannot accidentally duplicate an app.

The local harness now opens fresh databases through ordered, checksummed migrations. `migrations/0001_stock.sql` is the canonical fresh stock schema; old unversioned files are rejected without adoption or modification.21 local tests pass, including reopen/history preservation, failed-migration rollback and schema parity. See docs/MIGRATIONS.md. Hosted D1 migration execution, product authentication, UI and hosted acceptance remain unfinished; earlier references to migrations as wholly absent above are historical.

Latest29 October checkpoint: Workers-compatible internal HTTP stock handler and server-verified native Sites identity-to-membership boundary added.25 local tests pass; no hosted route or browser-facing signup exists. See docs/IDENTITY-AND-HTTP.md for the required native helper adapter, denied cross-product/email access and remaining UI/provisioning/hosted acceptance gaps. No separate OAuth/password/session stack is introduced.
