# Sites admin: website users and plans

31 October 2026 — local source only; not deployed.

## Request

The owner asked for the Sites administrator account to show who signed up, who created a website profile, and which customers have free or paid websites.

## Implemented locally

- Added a **Website users** tab beside the existing website request queue in `/admin`.
- Added read-only `GET /api/admin/users`, protected by the existing server-side configured administrator identity check.
- Added overall account/profile/preview/paid/no-profile counts, name/email search, status filters and 50-row pagination.
- Each row shows account signup date, count/latest date of submitted website profiles, and each website’s paid, free-preview, expired or suspended state. Suspended sites are excluded from current paid/free/expired access counts and shown separately.
- Matches submitted requests only through immutable `site_requests.owner_id`; it never infers identity from email.
- Returns only account name/email/timestamps and aggregate website status. Credentials, Google subject, sessions, request brief, uploaded files, private website content and payment IDs are excluded.
- No migration, mutation endpoint or plan/accounting change was added.

## Product semantics

A sign-in account alone is not a free plan. The existing product provides a three-day free preview when a website is published. A paid site is represented by its existing `paid_until` entitlement. Unpublished requests appear as a created website profile with no published plan. The UI says this explicitly so account signup is not mistaken for a trial or customer demand.

## Local verification

`pnpm exec vitest run tests/admin-users.test.ts --pool=forks --maxWorkers=1`: 3 passed. `pnpm exec vitest run --pool=forks --maxWorkers=1`: 42 passed across 8 files. `pnpm exec tsc --noEmit`: passed. `pnpm run build`: passed. Coverage includes ordinary-user/partial-identity denial, all plan/profile categories, suspended-access handling, owner-ID-only attribution, search, status filtering, 50-row pagination and response-data minimization. All database rows are synthetic in-memory fixtures.

## Release status and remaining validation

The Sites admin roster and shared-account changes are still local and unpublished. These local checks do not replace a private native staging deployment. Still required: stage the exact final source on the existing isolated Sites staging project, then actual desktop and phone checks for administrator-only access, roster categories/search/pagination and privacy boundaries, plus fresh shared-account SSO scenarios. The combined Transport candidate also needs its same-source hosted baseline/Supplier/auth/security/migration evidence. Public Sites6 and Transport48 are unchanged.
