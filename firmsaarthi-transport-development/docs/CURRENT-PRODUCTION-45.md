# Superseded checkpoint

Release46 is now current. Read CURRENT-PRODUCTION-46.md before any source publication or administrator/runtime change. The remainder of this file records the earlier release45 checkpoint.

# Current production45 — 29 October 2026

Production https://transport.firmsaarthi.com is release45 with email OTP recovery, on top of working Razorpay44. The authoritative stable checkout is ../tms-payments-release, sourcec47bee58d21b16414726bffcb7120b5e495b6352, fingerprint e3370970dcaf3bfe7c298002097d33a897622d74844e519b01d0a250b31f607d. Native saved version appgprj_6adcea83a2e48191834b17064accdbaa~appgver_2ef7bed6d5cc81919fdf289bd5561e92; deployment appgdep_6ae2fe41a9b881919ef871d167aa9d06/runtime20.

Read ../tms-payments-release/docs/EMAIL-OTP-RELEASE-CHECKPOINT.md for actual passing same-source hosted10/10, real email/code/user-completed reset, revoked session/password, preserved synthetic records and production smoke. Stage24 remains private; temporary synthetic administration removed in runtime25. No real customer password/data was changed for QA. Live webhook remains enabled and configured.

This tms-web checkout retains larger unpublished trip work and does not include the current stable payment/OTP implementation. Do not deploy it using stable evidence, overwrite its pending work, revert working payment/recovery or resume old untracked pending-payment/reset handoffs. Finish an explicit integration/rebase with current stable source and full fresh gate before publishing this different tree. Older release43/pending-email/payment paragraphs in this checkout are historical. Preserve original Apps Script and customer finances. No new source feature is claimed in this documentation-only checkpoint.
