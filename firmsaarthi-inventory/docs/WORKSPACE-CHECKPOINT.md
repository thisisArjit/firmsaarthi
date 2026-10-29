# Inventory workspace creation checkpoint — 29 October 2026,15:09 IST

Local service/API implementation only. No Inventory Site, native runtime entrypoint, real-user membership, provider account, hosted migration, DNS or public product was created. Re-listed all six owned Sites; no Inventory app exists. Transport production45/private stage24 and homepage2 remain unchanged. Do not advertise Inventory or deploy this synthetic test adapter.

## Explicit separate ownership

lib/workspace-start.mjs and POST /api/workspaces now accept only name/requestId after the handler obtains the trusted server-side Site identity. No caller email, role, actor or Transport session supplies access. A single primary-first D1 batch creates workspace, immutable creation receipt and the creator's owner membership together. SQL-time checks prohibit adopting or upgrading any existing member (including disabled users). A revoked creator cannot replay onboarding to restore membership. Existing teams, invitations, multi-workspace switching and cross-product identity mapping remain separate unfinished capabilities.

The same identity/request/name replays the original workspace; a changed intent reports409. Duplicate/concurrent starts cannot create extra tenants, owners or orphan workspaces. Creation is an explicit POST, never an automatic result of a GET or matching email. A browser onboarding form must obtain native identity context and bind its draft to it; native sign-in helper wiring and that form remain NEXT, not delivered here. The internal getIdentity callback is trusted test injection and MUST be replaced by the supported server helper before hosting. Service access supplies no user identity and cannot create membership.

Numbered additive migration0002_workspace_starts.sql creates an immutable creation receipt and preserves version1 stock/history/membership. lib/schema.sql remains an equivalence-tested reference snapshot, not a migration for existing databases.

## Actual verification

node --test tests/*.test.mjs:45passed,0failed/skipped. Eight added cases include separate-owner creation/replay/conflict, foreign Site/email/disabled membership rejection, revoked creator and immutable receipt, HTTP origin/body/identity/no-store guards, rollback if membership insertion fails, two synchronized independent connections racing same versus conflicting onboarding, and populated version1→2 upgrade preservation. The real HTTP handler also creates an item/warehouse and receives three units after a synthetic explicit workspace creation. Existing exact quantity, oversell/duplicate races, role/tenant/revocation, recovery and migration rollback tests pass. Syntax and diff checks pass. These are local SQLite/D1-contract Request/Response tests, not real native authentication, hosted D1/browser E2E or measured coverage. Temporary DBs and workers removed by tests.

## Precise next step

Use the supported Sites Vinext starter/server-only getChatGPTUser helper, preserving Site-scoped IDs and explicit per-product membership. Add a sober explicit Create Inventory workspace form with one retained intent and verified identity precondition; blocked/revoked accounts must not be mistaken for a new signup. Serve the existing public stock assets through supported framework assets; never deploy ignored loopback preview identity. Existing Worker ESM starter only copies its one entrypoint and cannot safely host this multi-file app unchanged.

Inspect current Sites and manifests again before creating the single owner-private Inventory staging project. Isolate its DB/resources, apply both numbered migrations through supported native deployment, implement source fingerprint/release gate and run actual desktop/phone core/recovery/concurrency/tenant/role/privacy acceptance. Only then consider public product/domain/homepage. Keep sorting and payload-free multitab refresh on the I1 roadmap. No new product beyond Inventory. No public release or release note claimed.

Source checkpoint: local fc7b1c7ee69a840ca2aae3dde5671872b497c49f (implementation702daf1 and guard083ec27). Sanitized private inventory-foundation backup4c639e2f0ec09260483557817181cf50ed7e1730 updated13 Inventory-only paths using the existing tree and expected-head fast-forward; remote workspace module re-read and exact content matched. No main/other-product/Actions/deployment change. Existing dirty docs/UI-CHECKPOINT.md preserved.

