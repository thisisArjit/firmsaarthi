# Inventory reload recovery checkpoint — 29 October 2026, 13:05 IST

Local implementation only; no Inventory Site, hosted D1, authentication entrypoint, public release or domain was created. Transport release44 remains live and unchanged. Its previously missing phone/payment tests passed and Live webhook TtZ4uLdUUZOSMN is enabled; do not repeat the old payment release task.

## Delivered locally

The stock controller can persist a frozen movement intent to browser session storage before submitting it, scoped to the server-verified workspace and actor. Reload first verifies both session and stock identity; only then can it restore the same original request ID/body/count version. Recovery is marked uncertain, requires an explicit retry, and cannot be discarded into a fresh request while unresolved. The visible review dialog reopens with the saved quantity/reason. Server replay and current membership remain authoritative; browser storage never grants access.

A different account discards the previous context before displaying a recovered draft. Invalid same-account saved data fails closed. Storage write failure blocks fresh posting; failure after an earlier unknown outcome retains the lock. Failure to remove a completed intent also retains the original request for safe replay. Successful confirmation removes the saved intent. No credentials, auth cookies or tokens are stored. This is same-tab session-storage recovery, not cross-device recovery, indefinite archival or an offline stock-posting queue. Closing the tab, clearing browser data or browser retention policy can remove it. No financial posting or stock history editing was added.

## Actual verification

node --test tests/*.test.mjs:37 passed,0failed/skipped. Six new tests cover unknown successful outcome plus reload, no-server-write plus reload, original adjustment version retention, different-account privacy, unavailable/corrupt storage and completion-cleanup failure. Existing oversell, duplicate-intent, tenant/role/revocation, migration rollback, HTTP/CSRF and exact quantity tests remain passing. Syntax and diff checks passed; no measured coverage percentage or hosted E2E claimed.

CUA desktop local loopback-only synthetic test: create kg item/warehouse; reviewed receive2.5; fixture commits the movement but returns503; review locks editing and offers Retry same request. Reload visibly reopens recovered receive2.5/reason; explicit retry displays already recorded/no duplicate. Stock is2.5kg and history has one receive row. Screenshot ignored outputs/reload-recovery-history.png. An earlier connection-reset fixture was automatically retried by the browser and returned a safe replay; the503 fixture was used to exercise actual UI reload recovery. Preview identity/storage and simulated failures remain in ignored outputs/ui-preview.mjs, never deployment source. Preview stopped and its in-memory synthetic DB discarded.

## Resume

Wire supported native Sites identity and deliberate Inventory-only workspace creation into a deployable private staging entrypoint. Keep resources independent from Transport. Add same-source fingerprint/release gate, then actual hosted desktop/phone core, concurrency, duplicate/recovery, tenant/role/file/privacy checks. Sorting, payload-free multitab refresh and further permission-revocation UI acceptance remain pending. The existing dirty docs/UI-CHECKPOINT.md predates this run and is preserved; this checkpoint supersedes only its memory-only recovery and pending Transport payment observations. No homepage offering advertisement, provider messages, real-user access changes, billing or public DNS.
