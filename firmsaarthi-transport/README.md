# FirmSaarthi Transport

Production 45; email OTP and Razorpay released.

Source checkout: tms-payments-release; commit 125f36ef7fbee7c78226e1798b2f803047e90c7c.
Use pnpm install --frozen-lockfile, pnpm exec tsc --noEmit, node scripts/test.mjs and pnpm build. Read SETUP.md and docs/STAGING.md. Production changes require same-source private hosted desktop/phone tests and the release gate.

Clean source snapshot only. Credentials, customer data, private reconciliation fixtures, runtime databases, uploaded files and original Git history are excluded. GitHub pushes do not deploy.
