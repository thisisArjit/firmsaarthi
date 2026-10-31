# Sites admin: website users and plans

31 October 2026 — local source only; not deployed.

## Request

The owner asked for the Sites administrator account to show who signed up, who created a website profile, and which customers have free or paid websites.

## Implemented locally

- Added a **Website users** tab beside the existing website request queue in `/admin`.
- Added read-only `GET /api/admin/users`, protected by the existing server-side configured administrator identity check.
- Added overall account/profile/preview/paid/no-profile counts, name/email search, status filters and 50-row pagination.
- Each row shows account signup date, count/latest date of submitted website profiles, and each website’s paid, free-preview, expired or suspended state.
- Matches submitted requests only through immutable `site_requests.owner_id`; it never infers identity from email.
- Returns only account name/email/timestamps and aggregate website status. Credentials, Google subject, sessions, request brief, uploaded files, private website content and payment IDs are excluded.
- No migration, mutation endpoint or plan/accounting change was added.

## Product semantics

A sign-in account alone is not a free plan. The existing product provides a three-day free preview when a website is published. A paid site is represented by its existing `paid_until` entitlement. Unpublished requests appear as a created website profile with no published plan. The UI says this explicitly so account signup is not mistaken for a trial or customer demand.

## Not yet verified

This feature has not had a typecheck, build, automated test, hosted staging test or production deploy. Earlier Sites SSO evidence is stale for this changed source. Before release, test the endpoint’s ordinary-user 403, admin totals and all status categories with synthetic rows, pagination/search, owner-ID-only matching, absence of secrets/content, and responsive desktop/phone UI on the existing private Sites stage. Then rerun all shared-account and original gates against the final combined fingerprint. Public Sites6 and Transport48 remain unchanged.
