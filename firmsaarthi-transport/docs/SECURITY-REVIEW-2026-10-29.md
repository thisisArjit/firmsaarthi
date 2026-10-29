# Defensive security review — 29 October 2026

Current status: production47 is published after matching-source hosted validation. Exact receipts and remaining security gaps are recorded below.

Scope: FirmSaarthi Transport's existing production46 source, an isolated security candidate, local synthetic tests and private hosted staging. This is a defensive review, not permission to attack third-party systems or production. No destructive testing, credential harvesting, real payment, customer data export or paid service is authorized. Security testing cannot establish that an application is hack-proof.

## Method and findings

Reviewed authentication/session recovery, server authorization and tenant boundaries, private files, payment authenticity/replay, resource exhaustion and dependency advisories. Used current primary guidance: [OWASP ASVS](https://asvs.owasp.org/), [API Security Top10](https://api-security.owasp.org/editions/2023/en/0x11-t10/), [authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [HTTP headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html), [resource limits](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html) and [Razorpay server integration](https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/). Reviewed on the date above; recommendations require periodic revalidation.

1. Authentication POST checked Content-Length, but buffered request.text() before applying its size check. Missing-length/chunked requests could consume excessive memory. Candidate uses the existing streaming reader with an8192-byte cap and cancels excess input before account work. Tests cover cancellation, UTF-8 byte size, exact boundary and unchanged cross-origin denial.
2. Baseline production dependency audit reported13 advisories:3critical,3high,6moderate,1low. These are package findings, not proof that every advisory was reachable in the deployed app. Candidate updates Next16.4.1, React/RSC19.2.9, Vite8.1.6 and scoped transitive packages. Production dependency audit now reports zero advisories. Full dependency audit reports zero high/critical; three lower-severity findings remain explicitly open in config/security-review.json. Do not hide these by excluding development dependencies: RSC/framework packages can execute in the built application.
3. A harmless production homepage GET showed missing baseline browser headers. Candidate adds HTTPS HSTS without includeSubDomains/preload, nosniff, strict-origin-when-cross-origin and a narrow CSP base-uri/object-src baseline. It preserves stricter private-file CSP, no-referrer, streaming bodies and multiple cookies. Full script/frame policies remain unimplemented pending Sites embedding/Razorpay compatibility work. This baseline does not claim comprehensive XSS or clickjacking protection.
4. Release fingerprint previously omitted worker/ and pnpm-workspace.yaml. Both now participate so Worker changes and effective pnpm11 overrides invalidate previous hosted evidence. Dependency audit checks fail closed on unavailable/expired/malformed audit, high/critical findings, unreviewed advisories or changed reviewed package paths/versions. Scope reviews expire after30days; they are not certifications or owner risk acceptances.

Advisory evidence includes [Next ImageResponse](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), [Next image optimization](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [React RSC denial of service](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g), [UUID](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) and [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). No application use of dynamic OG/ImageResponse/next-image was found; Vinext aliases and transitive package installation alone do not establish exploitability. Package updates still reduce exposure.

## Existing controls checked

- Server-side prepared queries and workspace/role authorization; platform administrator pinned by immutable account ID and verified owned workspace, never inferred from an email. Support sessions deny writes.
- Random256-bit sessions stored as hashes, Secure/HttpOnly host cookies in production, same-origin mutation enforcement. Google validates issuer/audience/nonce/verified email, PKCE and browser-bound state; automatic matching is restricted to trusted Google identity domains.
- Passwords use salted scrypt N16384/r8/p5, an OWASP-listed setting. Legacy hashes upgrade on successful login. Email reset codes are browser-bound, expiring, attempt-limited and single-use, and revoke previous sessions atomically.
- Server-selected plan prices, signed payment verification, captured-payment/order/amount/currency checks and idempotent single grant. Refunds/disputes remain operator-reviewed and do not rewrite transport accounting.
- Private scoped file access, bounded PDF/PNG/JPEG uploads, signature checks and attachment/sandbox responses. Signatures are not malware scanning. Fixed provider endpoints, redirect denial, request/response limits and scoped encrypted credentials reduce integration risks.

These statements reflect source review and targeted tests; they do not establish complete ASVS compliance or an independent penetration test.

## Remaining priorities

1. Priority account-claim hardening: password signup currently does not prove email ownership, while trusted same-email Google auto-link intentionally preserves the existing password. Review the pre-registered/unverified-account case: a verified Google email alone does not establish who chose an earlier password. Require ownership proof for new password registration and a deliberate secure treatment of existing unverified credentials/sessions before claiming this risk resolved. Do not silently reset customers' passwords, remove their Google access or grant cross-product/tenant rights. This release does not resolve this account-claim gap.
2. Deliberate app-level administrator MFA/step-up and recovery design; existing Google account MFA is not evidence of app-enforced MFA. Existing minimum8-character passwords fall below OWASP's15-character recommendation without MFA. Review stronger new/reset password rules and breached-password checks without forcibly resetting existing users; establish anti-abuse monitoring.
3. Compatible nonce-based script CSP and framing policy; stored-XSS review of all rendering paths, CSV formula exports and controlled rich content.
4. File malware scanning/CDR, retention policy and restore exercise; do not label uploads verified or safe based solely on MIME/signatures. Backups and incident-response readiness are not validated by unit tests.
5. Upgrade the three remaining local-tool/unused-OG dependencies through supported releases. Periodic audit and actual role/tenant/payment/file regression checks remain required. Inventory needs its own isolated hosted security gate before public launch.

## Verification and release status

Local candidate:200 automated tests passed, one pre-existing production-import fixture skipped; TypeScript passed. Local synthetic tests are not hosted E2E. Production46 remains authoritative until actual matching-source desktop/phone staging results and both release/security gates pass. Exact staging/production IDs and final outcome will be appended after native deployment results; do not infer publication from this document.

## Hosted staging receipt

All12 actual same-source hosted Playwright desktop/phone scenarios passed, measured1280x900 and390x844. Homepage response headers and preserved private-file CSP/attachment were checked on both devices. A9216-byte streamed synthetic authentication request returned413. Six concurrent recoveries of the existing captured Test payment preserved exactly one grant, unchanged term and200000paise net profit; no new charge. Screenshots were visually inspected. The12-case run is outputs/security-final/validated.json, and actual matching-source release evidence is outputs/staging-validation.json.

Fingerprint ad37f17caab794bbfe6351a8d5da600faf78e64808ec2cdd2c8700a6665db6bc; staging source507abcb9d4610f27ebfd07734d1a5a221814fdc8, saved version27 appgprj_6ae065554e2c819195306c14a182519e~appgver_fd802586d20081918980337b0dcbdb68; deployment appgdep_6ae33ff364c8819197798a3b0b4926fc succeeded with runtime28. Original synthetic staging administrator restored through cleanup deployment appgdep_6ae341aba1ec8191a3fddce2aa2838d1/runtime29 on the same source. Temporary operator's directory/customer access returned403, support inactive, all its sessions revoked and old session401. Synthetic fixtures remain private staging only. No real-user access, provider keys, webhook, customer records or financial history changed.

Both mandatory release gate and additional fresh dependency gate passed on staging. The subsequent successful production receipt follows below.


## Production47 publication receipt

Saved version appgprj_6adcea83a2e48191834b17064accdbaa~appgver_ca052234fec08191b080b1f186a89914; deployed source 163bb92c0de750d93ce6290ff4a7c057217662b4; fingerprint ad37f17caab794bbfe6351a8d5da600faf78e64808ec2cdd2c8700a6665db6bc. Native deployment appgdep_6ae342645eec81918938f31808c7f8fe succeeded 2026-10-29T12:56:37.739319+00:00, retaining protected runtime21, public audience, existing custom hostname and isolated production DB/BUCKET. No production environment/key/webhook/administrator changes were made.

The packaging workflow ran the existing hosted release gate first, the new matching-source dependency gate second, then the supported build. Read-only custom HTTPS checks confirmed production fingerprint, baseline headers, homepage, Google configuration, password reset and admin page200; unauthenticated directory/payment APIs401. No production mutation QA, real payment, email reset or customer-document access occurred. Staging cleanup and remaining security priorities above remain part of this release record. This is targeted hardening, not full ASVS compliance or an independent penetration test.

