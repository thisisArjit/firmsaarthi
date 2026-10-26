# Logistrace development setup

Use Node.js >=22.13 and pnpm. Install dependencies with pnpm install --frozen-lockfile.

1. Run pnpm build to generate dist/server/wrangler.json.
2. For a fresh local database only, apply the SQL files under drizzle/ in numeric order using node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/<migration>.sql. Track what was applied; do not replay existing migrations. Never use production data for tests.
3. Run pnpm dev, or preview the built Worker with pnpm start. Use only the printed loopback URL for local testing. Create a synthetic business account through sign-up.
4. Check with pnpm exec tsc --noEmit and node scripts/test.mjs. HTTP checks are local-only and create named synthetic fixtures; follow their setup and cleanup flags and do not point them at production.

Ordinary authentication uses workspace-scoped email/password sessions; Google linking/sign-in remains disabled until its OAuth web client is configured. For role details, see docs/TEAM_ACCESS.md. For subscriptions, see docs/SUBSCRIPTIONS.md.

Secrets belong in the authorized hosting secret store or ignored local .dev.vars, never source control. GPS_CREDENTIAL_KEY must differ between development and production. Keep encryption keys stable for existing encrypted credentials.

Sites currently manages live publishing and production migrations. The hosting project ID in .openai/hosting.json is not a secret; it identifies the existing deployment. This GitHub snapshot does not alter that deployment. D1 and R2 backups require separately authorized, verified recovery procedures.
