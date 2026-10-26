# Logistrace living roadmap

Updated 26 October 2026. User direction: research current transport solutions, maintain the roadmap, keep implementing and release real change notes every five hours. Existing heartbeat `build-logistrace-end-to-end` was updated, not duplicated, and now follows this chat. Scheduled execution depends on app/host availability and account limits; a cadence is not a guarantee of shipping every five hours.

Product-facing roadmap and release notes live in `lib/product-updates.ts` and Settings → What's new. Keep them aligned with this plan and actual delivered behavior. Future work must never appear as a released capability. Preserve the original Apps Script files outside `tms-web` and the existing company data and issued documents.

## Current baseline

- Subscription baseline: 10-day per-business trial; Individual ₹1,999/month or ₹19,999/year and Team ₹3,499/month or ₹29,999/year; four protected plan cards, access-aware upgrade prompts and administrator-only pricing/exemption/manual activation. Sign-in has no pricing banner. See SUBSCRIPTIONS.md. Gateway checkout/renewals remain gated; transport accounting is unchanged.
- Current increment: optional owner-only private POD upload, file-specific accept/reject review, replacements and latest-event correction history. See TRIP_DOCUMENTS.md. Stage rules remain the next priority.
- Published version 19: shared truck/customer/supplier/location lookups and refresh, cross-tab updates with draft preservation, Patna industrial-goods research and private prospect-to-customer workflow. This is not a live public load marketplace.
- Version 18: password signup into isolated workspaces, Google sign-in/linking implementation gated on OAuth configuration. Google setup and transactional verification/reset emails remain external prerequisites.
- Version 17: Dispatcher and Commercial member capabilities. Existing commercial, trip, document, finance, staff, payroll, settlement and import modules remain available within their documented limits.

## Priority 1 — document-backed trip execution

Private owner-only POD files and scoped review/correction links are implemented within Trips. Release 26 adds immutable per-new-trip owner choice to require accepted uploaded POD files for every consignment, with server-side acceptance/close gates and matching readiness suggestions. Existing trips retain reference-only compatibility. Next add versioned business-default policy and explicit placed, loaded, in-transit, destination-arrived, delivered and POD-accepted states with configurable document rules. Keep delegated document access gated until uploader/reviewer capabilities are defined and tested.

- Stage evidence can include placement confirmation, loading slip/photos, weighbridge receipt and signed delivery document. These are examples, not a universal legal checklist. E-way documents are required only when the configured business policy/applicable movement calls for them; never infer statutory applicability from a freight invoice.
- Version the policy at trip creation so later configuration does not silently invalidate old trips. Existing trips keep legacy/manual provenance unless explicitly upgraded.
- Distinguish uploaded, awaiting review, accepted, rejected, replaced and expired evidence. Record actor, actual event time, recorded time, original file hash, private object reference and review/correction reasons.
- Verify the current asset download/upload endpoints for each new purpose: front-end hiding or membership alone is not sufficient. Authorize the uploader, reviewer, trip/consignment owner and any cross-company participant for every operation. Do not reuse the vehicle-document purpose as a generic authorization shortcut.
- Enforce required evidence and allowed transitions server-side. Exceptional progression requires an authorized reason; it must not be a silent bypass. Handle partial/multi-stop delivery, rejection, resubmission, delayed upload and retrospective correction without erasing history.
- Keep trip execution separate from recognition policy and payment posting. Gate: source preservation, tenant/role/object access, file type/size validation, missing-evidence and stale-transition rejection, concurrency/replay tests, old-trip compatibility and unchanged accounting/invoice snapshots.

## Priority 2 — demand-side shipper portal and load posting

Separate shipper entry/navigation and explicit shipper capabilities, while reusing secure authentication rather than duplicating credential stores. Current single-membership data structures require an explicit, tested migration design before multi-business identity or cross-company transactions are enabled.

- Load fields: goods/category, pickup/delivery locality and exact addresses, loading/delivery window, weight and unit, dimensions if needed, truck/body/capacity, proposed price/currency/rate basis (per trip vs per tonne), tax/toll/loading/unloading/detention terms and expiry.
- Draft → reviewed/published → accepting proposals → awarded/expired/cancelled. Default to a controlled private pilot, not anonymous public publishing. Exact contact/address visibility follows an explicit release policy and consent.
- A company controls its own posts. Demand users never inherit transporter invoices, supplier costs, payroll, credentials or unrelated records. Existing transport-company logins retain their roles.
- Gate: shipper/carrier scopes, moderation and visibility policy, unit/rate validation, expiry/timezone handling, deliberate publication/withdrawal, scoped search and no leakage from existing workspaces.

## Priority 3 — bids, award and operational handoff

Transporters submit/withdraw versioned proposals with price basis, inclusions, validity and notes. Shippers compare bids privately. A transporter sees only its own bid; do not expose competitor prices by API, exports or side channels.

Single atomic, explicitly approved award; acknowledgement, change/cancellation and dispute rules; idempotent creation of linked booking/trip snapshots. Share only approved operational/commercial fields across participating companies, never their private ledgers. Prevent self-bids, stale/expired bids, multiple awards and duplicated bookings. A rate proposal is not a payment instruction; no funds are moved or real awards submitted during development QA. Commercial contract acceptance and settlement mechanisms require a documented policy before wider release.

## Priority 4 — KYC and trust foundations (required before an open marketplace)

Consent-based minimum necessary business/authority/vehicle records, private attachments, purpose and retention policy, expiry, reviewer scopes and appeal/correction. Avoid collecting full Aadhaar or unnecessary identity/bank records by default. Do not invent provider APIs or credentials.

Separate self-declared, submitted, manually reviewed and independently/provider-verified states. Manual document inspection never proves government validation, beneficial ownership or regulatory compliance. Government/provider checks need authorized accounts, an official contract and a successful verified integration. No public badges until their exact evidence, scope and expiry are defined. Marketplace safeguards and user policies must be reviewed before public activation.

## Priority 5 — completed-trip truck/transporter ratings

Allow reviews only from an authorized participant in a completed platform transaction, with truck registration, transporter and trip context. Define dimensions (placement, communication, vehicle condition, delivery) rather than an unexplained score. Prevent self-reviews and duplicate/replayed reviews; provide reporting, response, moderation, correction and dispute history. Show sample size and aggregation rules. Distinguish vehicle, driver, broker and transporter responsibility; never use an average rating as KYC proof or an automatic adverse eligibility decision. Do not seed fabricated ratings.

## Continuing foundations

Accountant/view-only and branch/assignment scopes; email verification/recovery; controlled backups/restores; quotation and rate/cost explanation; missing-cost and operational exceptions; credit/TDS/refunds and accounting close; staff/payroll usability and reconciliation; provider-authorized GPS/EWB/FASTag; shared data consistency and user-relevant copy. External-provider blockers do not block independent work.

## Every five-hour run

1. Read current source/diffs, this plan, PROGRESS and relevant boundaries. Resolve remote source/version state before edits; preserve concurrent work.
2. Research unresolved product choices using dated primary sources; update `docs/research/transport-platforms.md`. Treat vendor claims as vendor claims and distinguish inference from evidence.
3. Choose one useful, bounded slice with acceptance gates; choose routine product/architecture defaults without repeatedly asking the user. Document material policy/authority prerequisites and leave those features gated.
4. Implement, test and review tenant/role/object access, accounting integrity, idempotency, stale edits, shared data and desktop/phone UX. Use synthetic local mutation fixtures and remove them before packaging.
5. Publish only passing, usable increments through Sites, preserving the existing project/audience. No purchases, real bids/awards, money movement, messages outside this chat, real-user role changes, sensitive-document transmission or reset-credit spending without specific authorization.
6. Update in-app release notes with actual delivered changes and known limitations; update this roadmap and checkpoint exact native-returned version/deployment in PROGRESS after success. Report the release and next milestone in this chat. No fictitious release when nothing shipped.
