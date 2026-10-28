# Inventory identity and HTTP boundary

Local checkpoint, 29 October 2026, 01:42 IST. No Inventory Site, hosted endpoint, login UI or real membership is provisioned. This is an internal implementation, not an available offering.

## Supported identity design

Read Sites identity-and-secrets.md before continuing. Sites owns hosted authentication: use its supported server-only getChatGPTUser helper, stable Site-scoped visitor ID and native sign-in/sign-out paths. Do not scaffold separate OAuth/session infrastructure. Email is display/contact only, not an authorization key. Service access supplies no visitor identity and cannot silently become a customer user.

`lib/identity.mjs` requires server-verified userId plus the configured Inventory Site identity, then reads live explicit Inventory membership. No match, disabled user, wrong Site or ambiguous multi-workspace membership denies access. No automatic membership/signup, same-email Transport access, real-user grant or browser-selected org/actor is implemented. Multi-workspace selection must later be deliberate and membership-checked; the current handler fails closed.

`inventoryHttp` receives a SERVER-ONLY getIdentity adapter and fixed SITE_ID/HTTPS APP_ORIGIN alongside Inventory's isolated DB. This adapter must be wired to the native helper in the future hosted entrypoint, never to browser JSON, arbitrary raw headers or an unverified JWT. The function itself ignores client identity headers and Transport cookies. Test identity callbacks simulate this trusted boundary; they do not prove actual Sites authentication. No separate session table, password store, token-issuance or login/logout endpoint exists.

## Implemented routes and safeguards

`lib/http.mjs` is a Workers-compatible Request/Response handler, not a listening server. GET /api/session returns current role; GET /api/stock and /api/history read scoped state/history. POST /api/items and /api/warehouses require owner; POST /api/movements supports existing receive/issue/adjust/reverse permissions and idempotency. No file, finance, valuation or public provisioning routes.

POST requires exact Origin and JSON, with streamed16KiB cap and rejection of identity/role/email fields. Fixed host and cross-site validation, no-store/nosniff responses, no CORS, and redacted internal DB errors. SQL-time role/version/nonnegative/tenant/reversal guards remain in D1Stock. First movement201, replay200, conflicting/insufficient/stale409. No stock-schema migration needed in this increment;0001 remains unchanged.

## Actual local verification

25 tests passed,0failed/skipped. Four new handler/identity cases cover explicit membership, revocation, cross-Site/email/client-header spoofing, ambiguous workspace denial, receive/issue/history/replay, tenant and role isolation, CSRF, malformed/oversized requests, missing adapter, wrong host, absent public provisioning and no-cache/CORS. Existing stock/migration/concurrency tests pass. These use Request/Response and local SQLite D1 contract fixtures; not hosted D1, browser, network-server E2E or measured coverage. Only synthetic local membership exists and temporary databases/workers are cleaned.

## Next step

Wire native Sites identity through the supported starter into this adapter; implement deliberate separate Inventory workspace creation/membership without importing Transport records. Build Items/Warehouses/Stock/History UI and recovery while preserving unfinished drafts. Then provision one owner-private isolated Inventory staging Site, native D1 migration and same-source desktop/phone/security/concurrency acceptance. No public Inventory/DNS/homepage listing until complete usable release passes. User-facing Google/password options require supported platform capability confirmation; no copied Transport credentials or new grants assumed.

## Dated review evidence

- Zoho roles: https://www.zoho.com/us/inventory/help/settings/users.html — action permissions and revocation. Our roles remain workspace-wide; warehouse-specific grants are a gap.
- Zoho activity reports: https://www.zoho.com/us/inventory/help/reports/activity-reports.html — who/when/record logs. Movements retain actor/time; master/session audit remains a gap.
- Adjacent CRM audit: https://help.zoho.com/portal/en/kb/crm/faqs/audit-log/articles/audit-logs-3-2-2023 — chronological actions and record timelines. Future shared design pattern, no CRM product started.
