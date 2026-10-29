# Inventory schema lifecycle

Added 28 October 2026. No hosted Inventory database exists yet.

`migrations/0001_stock.sql` is the canonical initial stock schema for a fresh, isolated Inventory database. It intentionally uses plain CREATE statements: an existing unversioned schema must fail instead of silently retaining older triggers. It never imports Transport tables, identities or stock. `lib/schema.sql` remains a reference snapshot; an automated sqlite_master comparison ensures its stock tables, constraints, indexes and triggers match the initial migration.

## Local reference tests

`openStock` invokes `migrateReference`, with foreign keys enabled, a write lock and an atomic transaction. The local-only `inventory_reference_migrations` table records ordered filenames, SHA256 of LF-normalized SQL and application timestamps. Reopening a versioned database is read-only when no migration is pending. Changed/missing/reordered history is rejected; failures roll back pending DDL, rows and history. An unversioned pre-existing database requires explicit review and is left intact. No automatic baseline adoption or deletion is provided.

This Node implementation is test infrastructure, not a Workers import. Never expose it, a migration endpoint or internal provisioning functions through product HTTP routes. No arbitrary customer-supplied SQL or directory is accepted by an API; none exists.

## Future hosted D1

Use supported Sites/D1 migration packaging against the newly provisioned private Inventory staging database only, after reading the Sites runtime contract. Cloudflare's native tooling records its own d1_migrations table. Do not treat the local reference checksum ledger as D1 migration evidence or run the Node migrator against a hosted binding. Keep ordered migrations immutable after use; append a new version for changes. Verify source/resource identities, backup/recovery and actual hosted rollback/concurrency behavior before publication. No database ID, deployment manifest, public route or successful hosted migration is claimed by these files.

Actual local verification: 21 tests passed, no failures/skips. Five migration tests cover fresh/reopen preservation, unversioned rejection, history drift/order, rollback and schema parity; existing stock, tenant, role and synchronized two-connection concurrency checks also pass. No customer database was opened or upgraded. Next: product-specific authentication, API/UI, private staging and same-source hosted acceptance.

Official engineering reference: https://developers.cloudflare.com/d1/reference/migrations/ (reviewed 28 October 2026).

29October2026: additive0002_workspace_starts.sql adds the immutable per-creator onboarding receipt. A populated version1 upgrade is tested to preserve all workspace/member/item/warehouse/balance/movement rows. Hosted Sites/D1 application remains unexecuted; local migration checks are not deployment evidence. Never rewrite0001 or adopt an unversioned customer database.
