# logistrace
Logistics done E2E

## Application source

Private source snapshot of Logistrace release 26. React/TypeScript transport operations app, built with Vinext and Cloudflare Workers, D1 and private R2 storage.

Includes bookings, invoices, supplier settlements, accounts, staff/payroll, trip progress and owner-reviewed POD files, vehicle records, provider integration foundations, shared master data, business discovery and subscription administration. Feature scope and limitations are in docs/ROADMAP.md and the product release notes.

## Development

Node.js 22.13+ and pnpm are required. Run pnpm install --frozen-lockfile, then pnpm exec tsc --noEmit and node scripts/test.mjs. Build with pnpm build. See SETUP.md before running a fresh local database.

## Source and data boundaries

This is a clean snapshot, not the historical Sites Git repository. Customer records, database files, uploaded documents, credentials, environment files, production reconciliation reports and one-off migration operator scripts are excluded. The private customer-import reconciliation test is omitted; synthetic service tests remain. Existing application runtime source is unchanged.

The original Sites app remains the live deployment. Creating or updating this GitHub repository does not deploy the app, copy its database, enable automatic synchronization, or create a Cloudflare account. Hosting bindings and schema migrations remain in source; actual provider secrets and database/bucket contents must be managed separately.

## Configuration

BILLING_ADMIN_USER_ID pins the billing administrator. GPS_CREDENTIAL_KEY is a stable, secret, 32-byte base64 encryption key. Google OAuth and payment/provider integrations require authorized setup; do not assume they are enabled. Never commit real secrets or customer documents.

Source commit: 189b1071111ac744a9fc3044e2574ae47ef4982e
Snapshot prepared: 26 October 2026 (Asia/Kolkata).
