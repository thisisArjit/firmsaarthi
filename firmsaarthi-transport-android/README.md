# FirmSaarthi Transport for Android

Android client for the existing Transport product. Publisher account/contact requested by the owner: firmsaarthi@gmail.com; developer name FirmSaarthi. This does not claim a Play developer account has been registered or verified.

Current internal pilot: outputs/FirmSaarthi-Transport-test.apk opens the existing production website; outputs/FirmSaarthi-Transport-staging-test.apk opens owner-private staging. Both APKs were built, signature/identity/website-association checked;2 Java unit tests pass and Android lint has0 errors. They are debug-signed test builds, not Play releases. No connected Android device was available, so installed-device Google login, documents and navigation E2E remain unverified. The browser toolbar can remain visible until website/signing verification is completed. See docs/PROGRESS.md for exact hashes and remaining checks.

Uses Google's Android Browser Helper/Trusted Web Activity. A supporting browser renders the real HTTPS app, keeping the same accounts, memberships and records. Google sign-in, file selection/downloads and provider pages stay in browser security context. There is no embedded WebView, native credential store, analytics SDK, background location or copied customer database. Internet is required. Browser/site permissions still apply to any user-selected camera or file action.

Production and private-staging flavors use different package identities. Debug builds append .debug and are for internal testing. No production website, DNS, OAuth client, database or user role is modified by building this client. Until a release signing certificate is linked on the correct website through Digital Asset Links, the browser honestly displays Custom Tab controls. Never bypass verification to hide the origin.

Build with JDK17+ and Android SDK36 after owner-approved SDK licensing:

    ./gradlew :app:assembleStagingDebug :app:assembleProductionDebug :app:testProductionDebugUnitTest :app:lintProductionDebug

Windows: use gradlew.bat. Android Studio can open this folder. Keep local.properties and signing keys out of Git. There is no release signing key or Play upload credential in this project. Never publish a debug-signed artifact. The Gradle unit task tests hostile/valid incoming URL handling; lint checks the Android package configuration.

Store publication is a separate unfinished step. See docs/PLAY-RELEASE.md. Full Android device/emulator E2E, exact release-key asset links, privacy/deletion policy and subscription-billing review are required. Local compilation or a website screenshot does not establish Android E2E. Existing Transport staging-first release rules remain in force.
