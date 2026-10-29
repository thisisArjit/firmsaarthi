# Supplier workspace — staging proposal

Owner direction: 29 October 2026. Supplier experience is the only active build priority. Pause Inventory, unrelated Transport/auth development, marketing and other automations. Reuse the existing private Transport staging Site. No public release until owner review and fresh required gates pass.

## Jobs and audiences

Truck owners and fleet suppliers need to maintain a fleet, describe lanes they serve and make a business contact discoverable without becoming a transport operator. Transporters need a directional route/equipment/payload search and a clear way to contact a willing supplier. A published listing is an introduction, not a load, bid, booking, contract, verified ownership record or availability guarantee.

New registrations explicitly choose the Transporter entrypoint or Truck supplier entrypoint. The same authentication infrastructure supports both; workspace business mode is server-controlled and immutable through these APIs. Existing users retain their identity, membership, financial history and sign-in. Choosing a different entrypoint does not upgrade or convert an existing account. Existing transporters may explicitly maintain their own separate supplier listing. Demand is a future capability, not an empty portal or implicitly granted access.

## First complete workflow

| Section | Actual scope | Acceptance |
| --- | --- | --- |
| Overview | Fleet/route counts, setup steps, publication state | Counts derive only from own records; no fabricated demand or leads |
| My trucks | Registration, equipment, payload tonnes, owned/attached declaration, city, available/busy/not advertised, expiry | Registration private; duplicate plates within workspace denied; availability expires in IST; optimistic concurrency and exact replay |
| Routes | Origin, destination, equipment, explicit return direction | Reverse search only when return lane selected; no inferred all-India coverage |
| Profile & visibility | Business name/type/base city/contact/phone/email/description, saved preview, consent, publish/hide | Private by default; owner-only writes; any edit hides listing until explicit republish |
| Transporter discovery | Authenticated supplier cards with directional city, equipment, minimum-payload and unexpired availability filters | No private draft/plate/account email/driver/document/rating/settlement leakage; paginated; revoked owner or hidden listing disappears |

Business contact is independently entered, not copied from login email. Consent covers these specific business/contact fields. Only registered transporter workspaces can discover listings; anonymous users do not get a public phone directory. This is an intentional first audience boundary; broader demand/public visibility requires its own reviewed policy. Nothing sends an unsolicited message. Driver details, identity documents and bank data are not collected in this slice.

The private transporter Suppliers ledger, private ratings, historical route search, costs and payments remain separate. Discovery neither merges masters nor rewrites invoices, costs or issued history. It has no financial posting.

## Engineering and failure behavior

Additive migration0038 introduces workspace business modes, supplier listing drafts/published snapshots and immutable request receipts; Google continuation binds a new-account business kind in the server flow. Existing rows default to Transporter by absence of a mode row. New supplier account/workspace/mode creation is atomic. Supplier users cannot call Transport operations, workspace creation, finance or billing APIs. Membership role and enabled account are checked; publication checks the owner; the write rechecks current authorization inside its compare-and-set transaction.

The first preview supports100 trucks and100 routes per listing. A single bounded aggregate gives one version for a reviewed listing, with a private published projection and atomic request receipt/audit. Stale edits409; exact request retry confirms the original version; changed request payload409. Fleet changes never silently overwrite another tab. Open forms remain mounted across tabs. An unconfirmed save is scoped to the account in sessionStorage and retries the same request after reload; successful saves are authoritative in D1. Requests and draft contents are not kept in shared localStorage.

## Priorities after preview

1. Owner reviews the actual phone/desktop staging workflow and discovery audience.
2. Resolve observed staging usability/security failures; add supplier-specific hosted gate alongside unchanged Transport/security gates.
3. Before any public supplier signup, deliberately integrate the unfinished email-ownership/legacy account-claim protection in the separate auth candidate and repeat all affected hosted tests. Existing password signup in baseline47 is not email ownership proof. No new verification badge is claimed.
4. Explicit enquiry/contact-history workflow with abuse reporting, contact visibility choices and staff permissions; demand-side capabilities only as a complete separate workflow.
5. Document expiry/consent/manual review with honest status, saved routes/availability refresh and controlled fleet import. Collect sensitive documents only after retention/access decisions and checks.
6. Booking handoff/rate submissions and completed-trip-based ratings, disputes and response controls. No public load marketplace without review.

Not in this preview: live GPS/SIM/FASTag, government verification, bids, bookings, payments, KYC approval, automatic lead messages, reviews or revenue claims.

## Saved-listing readiness and review — 30 October2026

Observed gaps: a completed published supplier still saw Continue setup leading back to Routes; the saved preview could call an expired truck available; route/truck saves could leave a previously checked preview-consent checkbox mounted. The next focused increment derives a checklist and next section from saved profile, eligible-for-listing trucks and lanes. Complete drafts go to review; published workspaces show maintenance guidance instead of incomplete setup. Busy or expired fleet can still describe a business listing, but never counts as currently available capacity. All-not-advertised fleet is explicitly distinguished from no trucks.

One shared display helper handles availability labels/counts and the end-of-day India expiry boundary. A local display clock updates on return/minute without fetching or replacing form inputs; it is guidance, not server authorization or live tracking. Server publication/expiry validation and available-only search remain authoritative and unchanged. Any confirmed save closes the prior preview and removes its checkbox, requiring a new review/consent on the next publish. Unknown save outcomes still use the original exact-receipt recovery, and unsaved business/truck/route form fields remain mounted.

Acceptance: actual measured desktop/phone missing-profile→truck→route guidance; complete draft Review & publish; published Review listing; inactive fleet cannot publish through UI; changing a saved route invalidates earlier preview consent while preserving unfinished profile input. A browser-clock expiry display check must be labelled emulation, not actual server-time hosted expiry proof. Server expiry already has deterministic service tests. No new schema, roles, contacts, verification, financial recognition or automatic publication is introduced.


## Directory freshness increment — 30 October2026

Observed gap: an already-open discovery page retained old contact cards when a later read failed, and fetches had no cancellation/generation ordering. A hidden listing could therefore remain on a page until deliberate navigation. The focused fix adds manual and visible-window focus refresh of the last submitted filters/page, a server-read timestamp, removal of contact actions during unconfirmed/failed reads and generation guards. Unsubmitted filter text is preserved. There is no background minute-by-minute network polling, provider traffic, contact messaging or write retry. Offline/session errors are not described as zero matching suppliers. Already-viewed contacts cannot be retracted from memory/devices; the interface refreshes future reads, not past disclosures. Acceptance requires same-source hosted desktop/phone unpublish→return→card removal, unchanged open filter draft, explicit refresh/republication and session-expiry removal, plus the existing supplier matrix.
