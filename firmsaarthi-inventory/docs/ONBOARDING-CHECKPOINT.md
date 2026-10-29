# Inventory onboarding checkpoint — 29 October2026,17:41 IST

Local prototype only. No Inventory Site, public URL, real-user access grant or hosted authentication was created. Re-listed all six owned Sites in this cycle; none is Inventory. Transport46, its authorized operational platform administrator, private stage26 and homepage2 remain intact. No new product is advertised.

## Completed local slice

GET /api/onboarding uses only the trusted server callback's configured Site-scoped identity. It distinguishes a new account from one existing active membership. Disabled/ambiguous memberships and revoked creators with immutable creation receipts fail closed; they do not receive a fresh-owner escape path. The read creates no workspace or membership. POST /api/workspaces additionally checks the optional browser context precondition against the current verified Site/user before the existing atomic creation/replay service. Caller context is never authorization.

public/onboarding.html and onboarding.mjs add a sober explicit workspace-name review/confirmation flow and existing-workspace handoff. WorkspaceClient freezes one name/request ID, saves it in same-tab session storage before submission, restores it only for the same verified Site/account, and locks replacement after an uncertain response. Retry uses the original ID/body, including after reload when the server already created the workspace. Storage failures block new writes; response-cleanup failures retain same-ID recovery. A different account clears the old private draft; server preconditions close the switch between preflight and POST. Sign-in-required and membership-review states do not expose an automatic create form.

## Actual checks

node --test tests/*.test.mjs:51passed,0failed/skipped. Six new integrated client/real-handler cases cover read-only discovery, foreign/anonymous/disabled rejection, reviewed creation plus lost-result/reload/replay with one workspace/start receipt/owner, account changes before and at POST, different-account draft privacy, unavailable/corrupt storage, revoked-creator recovery, existing member behavior, single-flight submit and cleanup-failure retry. Existing independent concurrent onboarding, oversell/duplicate-stock, tenant/role/revocation, exact-quantity and migration rollback tests remain passing. Syntax and diff checks pass. These use local SQLite with a D1 contract harness, not native Sites auth or hosted D1/E2E.

Actual CUA desktop loopback walkthrough: enter Synthetic onboarding QA; review name; explicitly confirm. The ignored synthetic fixture commits creation but deliberately returns503. The form retains its name, disables Back and offers Retry same workspace request. Reload restores the frozen name and retry state; explicit retry shows Your existing workspace was confirmed. No duplicate was created. Open Inventory workspace reaches the empty stock view with owner controls. Screenshot outputs/onboarding-recovery-confirmed.png is ignored. The loopback-only synthetic identity adapter is never deployment source; its server was stopped and in-memory records discarded. No hosted/phone result or measured coverage is claimed.

## Next concrete integration

Wire the supported Sites Vinext server-only getChatGPTUser helper and deliberate root routing: authenticated eligible new account → onboarding; active member → stock; revoked/ambiguous access → review. Keep APP_ORIGIN/SITE_ID explicit, use only server-verified Site identity and preserve the configured Site's IDs. Serve the public assets through the supported framework. Do not expose ignored loopback identity, trust raw caller headers/email, copy Transport sessions/data or scaffold a separate password/OAuth stack.

Then register one isolated owner-private Inventory staging project only after rediscovering projects/manifests, apply both numbered migrations through the native storage workflow and add a source fingerprint/hosted release gate. Required actual desktop/phone acceptance includes onboarding/reload/identity changes, core stock happy paths, invalid/duplicate/concurrent writes, stale adjustments, tenant/role/privacy and stock-ledger reconciliation. Until this passes, no inventory.firmsaarthi.com DNS, public release, homepage offering or new customer release note. Sorting/multitab refresh and invite/warehouse-scope controls remain separate I1 gaps; no purchasing/sales/valuation module was started.

## Dated feature gaps

| User job / official pattern | Current local evidence | Remaining gate |
| --- | --- | --- |
| Explicitly create a separate organization | Reviewed name and atomic single workspace/start/owner | Native identity/root UI and private hosted acceptance |
| Retry without creating a second organization | Frozen account-scoped request survives reload; one replayed result | Actual hosted interruption tests on desktop/phone |
| Retain an existing membership without upgrading it | Existing member handoff; revoked creator/disabled/ambiguous states blocked | Invitations, reviewed multi-workspace selection and revocation lifecycle |
| Keep stock separate from financial accounting | Existing exact quantity ledger/rollback/races unchanged | Hosted D1 invariants; valuation remains later |
