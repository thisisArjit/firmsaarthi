# Source synchronization

Prepared 29 October 2026. Private repository snapshots; no original local Git histories imported.

- firmsaarthi-transport: local tms-payments-release, commit `125f36ef7fbee7c78226e1798b2f803047e90c7c`; Production 45; email OTP and Razorpay released.
- firmsaarthi-transport-development: local tms-web, commit `ca061df163e7209437062784d1b14371e72fb7a7`; Unpublished development branch; do not deploy over stable production.
- firmsaarthi-home: local firmsaarthi-home, commit `eba150b56436e50d38f4dc496297c0df31d990c4`; Published brand homepage.
- firmsaarthi-inventory: local firmsaarthi-inventory, commit `cb401211fb9fa98cc302f14d19e6e0c645022e26`; Local prototype only; 45 local tests, hosted release gate pending.
- firmsaarthi-transport-android: local firmsaarthi-transport-android, commit `28a3a5810c835fb2b9cfbf53020e1e6476783d31`; Internal client only; not Play-published.

Current working source and documentation are included, including existing uncommitted checkpoint changes. Source files are unchanged except safe README/SETUP/PROGRESS summaries and omission of the production-data-specific reconciliation test. One-off customer migration operators, migration reports, hosting identity files, secrets, runtime databases and generated files are excluded. The homepage dist folder is its authored static source.

Transport production45 deployed source c47bee58d21b16414726bffcb7120b5e495b6352; fingerprint e3370970dcaf3bfe7c298002097d33a897622d74844e519b01d0a250b31f607d. Checkpoints and source backups are not new application releases. Pushes must not enable automatic production deployment. Future updates preserve remote edits and use expected-head fast-forward updates.

## Transport production46 — 29 October 2026

Current stable Transport source: `9eece6f3db2309c6aef7ed2fa403af5adb4827a9`, fingerprint `f2fedd7c1343dfaf0ec763faf8d58f0bd8834d86b99cea4804c652801a3ab22e`. Production deployment `appgdep_6ae33472a6a88191a48f5cbeed69b367`, runtime21, succeeded2026-10-29T11:57:05.822554Z. The protected administrator assignment uses the existing operational account; its private identity ID is excluded.193 automated tests and12 hosted same-source desktop/phone scenarios passed. See [release and access evidence](firmsaarthi-transport/docs/ADMIN-USERS.md). Payment/email credentials and customer records remain outside GitHub; pushes do not deploy.

## Inventory local onboarding checkpoint — 29 October2026

Local source932f5f8 adds reviewed own-workspace onboarding, read-only eligibility and account-scoped same-intent reload recovery.51 local tests and a synthetic loopback desktop recovery walkthrough passed; this is not hosted/native identity or a public product release. Read firmsaarthi-inventory/docs/ONBOARDING-CHECKPOINT.md for the supported native-entrypoint/private-staging next step. No real-user access, production deployment, DNS, customer data or secrets changed. Transport46 remains authoritative and unchanged. Source backups are separate from publishing.
