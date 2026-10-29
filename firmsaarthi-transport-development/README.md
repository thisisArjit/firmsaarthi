# FirmSaarthi Transport

Unpublished development branch; do not deploy over stable production.

Source checkout: tms-web; commit ca061df163e7209437062784d1b14371e72fb7a7.
Use pnpm install --frozen-lockfile, pnpm exec tsc --noEmit, node scripts/test.mjs and pnpm build. Read SETUP.md and docs/STAGING.md. Production changes require same-source private hosted desktop/phone tests and the release gate.

Clean source snapshot only. Credentials, customer data, private reconciliation fixtures, runtime databases, uploaded files and original Git history are excluded. GitHub pushes do not deploy.
