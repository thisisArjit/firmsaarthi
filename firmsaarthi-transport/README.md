# FirmSaarthi Transport

Production 46; users/plan expiry directory, email OTP and Razorpay released.

Source checkout: tms-payments-release; deployed source 9eece6f3db2309c6aef7ed2fa403af5adb4827a9.
Use pnpm install --frozen-lockfile, pnpm exec tsc --noEmit, node scripts/test.mjs and pnpm build. Read SETUP.md and docs/STAGING.md. Production changes require same-source private hosted desktop/phone tests and the release gate.

Clean source snapshot only. Credentials, customer data, private reconciliation fixtures, runtime databases, uploaded files and original Git history are excluded. GitHub pushes do not deploy.
