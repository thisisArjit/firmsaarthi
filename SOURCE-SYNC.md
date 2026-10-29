# Source synchronization

Prepared 29 October 2026. Private repository snapshots; no original local Git histories imported.

- firmsaarthi-transport: local tms-payments-release, commit `125f36ef7fbee7c78226e1798b2f803047e90c7c`; Production 45; email OTP and Razorpay released.
- firmsaarthi-transport-development: local tms-web, commit `ca061df163e7209437062784d1b14371e72fb7a7`; Unpublished development branch; do not deploy over stable production.
- firmsaarthi-home: local firmsaarthi-home, commit `eba150b56436e50d38f4dc496297c0df31d990c4`; Published brand homepage.
- firmsaarthi-inventory: local firmsaarthi-inventory, commit `cb401211fb9fa98cc302f14d19e6e0c645022e26`; Local prototype only; 45 local tests, hosted release gate pending.
- firmsaarthi-transport-android: local firmsaarthi-transport-android, commit `28a3a5810c835fb2b9cfbf53020e1e6476783d31`; Internal client only; not Play-published.

Current working source and documentation are included, including existing uncommitted checkpoint changes. Source files are unchanged except safe README/SETUP/PROGRESS summaries and omission of the production-data-specific reconciliation test. One-off customer migration operators, migration reports, hosting identity files, secrets, runtime databases and generated files are excluded. The homepage dist folder is its authored static source.

Transport production45 deployed source c47bee58d21b16414726bffcb7120b5e495b6352; fingerprint e3370970dcaf3bfe7c298002097d33a897622d74844e519b01d0a250b31f607d. Checkpoints and source backups are not new application releases. Pushes must not enable automatic production deployment. Future updates preserve remote edits and use expected-head fast-forward updates.
