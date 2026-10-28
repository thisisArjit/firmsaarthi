# Android distribution checkpoint — 28 October 2026

Owner requested an Android app for FirmSaarthi Transport with firmsaarthi@gmail.com as publisher. The local project is a browser-backed Android client of the existing product, not a second business database. Application ID com.firmsaarthi.transport; proposed store name FirmSaarthi Transport. Owner controls registration type/legal publisher details; do not infer a company registration or DUNS from a Gmail address.

Initial internal debug APKs have now been built and independently checked; installed-device verification is still pending. Source configuration alone is not evidence of an APK or a Play release. Actual build outcomes and artifact hashes are in PROGRESS.md/ignored outputs. No release keystore, credentials or customer records belong in Git.

## Publication prerequisites

1. Inspect the existing Play Console using the requested account before registering anything. Google's current setup documentation lists a one-time US$25 registration fee and a Developer Distribution Agreement. Existing no-card/no-payment constraint remains: do not purchase registration or accept new terms without owner approval. Identity/account-type/device verification and any required closed testing remain owner/provider requirements.
2. Establish release signing/backup and owner-controlled Play App Signing. Never substitute the local debug certificate. Generate the exact website assetlinks.json from the actual release app-signing certificate, with no wildcard origins or package names. Add it only through Transport's same-source private staging gate. Staging gets its own package/certificate association; no private dispatch bearer is bundled.
3. The current website contains plan activation/upgrade flows. Google Play's Payments policy covers paid cloud/business software and can apply to purchase links/buttons inside a TWA. Do not assume the physical-transport exemption covers this software subscription. Before Play distribution, deliver and test a policy-appropriate consumption-only app experience or an approved billing programme/integration. Razorpay support on the website alone is not Play approval. The internal APK is not a means to evade store rules.
4. Publish accurate privacy, support and account/data-deletion information; complete Data Safety from actual hosted-app/provider behavior. The browser client still accesses account identity, business contacts, documents and potentially user-reported location. Do not claim no data is collected merely because native code has no analytics SDK. Owner review of legal declarations is required; no policy document or Play form is submitted automatically.
5. Run installed-Android tests against synthetic private staging: sign-up/password/Google login, isolation/roles, consignments/invoices, file picker/camera where supported, PDF/export download, external-provider return/cancel/retry, back navigation, rotation and offline recovery. Verify no role or financial changes from client wrapping. Record device/OS/browser, artifact SHA256 and exact website fingerprint. Then production read-only smoke after the website gate passes. No real payment or document transmission for QA.

Release gate: node scripts/check-play-release.mjs intentionally blocks until actual evidence and final owner Play review exist. No automatic upload/publication or production deployment on GitHub push.

## Official evidence

- https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities
- https://github.com/GoogleChrome/android-browser-helper/releases/tag/android-browser-helper-2.7.4
- https://developer.android.com/google/play/requirements/target-sdk
- https://support.google.com/googleplay/android-developer/answer/6112435
- https://support.google.com/googleplay/android-developer/answer/10281818
- https://developer.android.com/studio/terms

Current toolchain targets API36 per the official 2026 Play requirement, with AGP8.13.2/Gradle8.13 and Android Browser Helper2.7.4, confirmed in Google's Maven metadata. Tool downloads must be verified against official checksums. SDK licence acceptance was explicitly approved by the owner in this chat; no paid services or Play registration were included.
