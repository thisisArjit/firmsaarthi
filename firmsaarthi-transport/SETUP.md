# Development setup

Use Node.js 22.13+ and pnpm. Install with pnpm install --frozen-lockfile. Build with pnpm build. Apply numbered drizzle migrations only to an isolated fresh local database; never replay blindly or use production customer data for tests. Secrets belong in ignored local environment files or protected hosting settings. Run pnpm exec tsc --noEmit and node scripts/test.mjs. See docs/STAGING.md and config/environments.json for the mandatory hosted release gate. Native hosting identities and protected values are managed separately.
