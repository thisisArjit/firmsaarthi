# FirmSaarthi Inventory

Local stock-ledger foundation, not a hosted or available product. Target inventory.firmsaarthi.com remains unconfigured. Do not advertise it on the public homepage yet.

Run Node22.13+ (current machine Node24):

    node --test tests/stock.test.mjs

No dependencies, provider setup, billing, customer records or external calls are required. Tests use synthetic in-memory SQLite and one temporary file deleted after the concurrency test.

Implemented internally: workspace-scoped SKU/items/base units, warehouses, owner/operator/viewer permissions, exact quantities, receive/issue/reasoned adjustment and one explicit reversal, immutable posted movement rows, duplicate request protection, balance versions, negative-stock prevention and movement history. Quantities are integer millionths; each/box allow whole units and kg/litre/metre permit3 decimal places. This is quantity tracking only: no valuation, invoicing, financial posting or tax compliance.

The current Stock class uses Node SQLite as a reference engine and local invariant harness. It is not deployable to Cloudflare Workers as-is. Port the database adapter to supported Sites D1 prepared statements and transactional batch/SQL guards, add deliberately isolated product authentication, API and sober phone UI, then provision private hosted staging. Do not expose the current constructor/provisioning functions directly to requests: their org/user arguments are internal trusted identities, not authentication. No Transport account or email grants Inventory access.

See docs/PROGRESS.md, docs/ROADMAP.md and docs/RESEARCH.md before continuing. No Sites ID is registered. Sanitized source is backed up under firmsaarthi-inventory/ on the inventory-foundation branch of the existing private thisisArjit/logistrace repository. Re-discover hosted projects before creation so a later run cannot accidentally duplicate an app.

