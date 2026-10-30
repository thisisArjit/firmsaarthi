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


## Private own-data downloads — 30 October 2026

Job: a supplier owner needs a portable saved fleet/route list without exposing registrations in discovery or copying the transporter financial ledger. Existing My trucks and Routes tabs gain owner-only CSV downloads; no new empty tab. The server reads the current enabled workspace owner in the same joined query as the saved draft. No caller-supplied tenant scope is accepted. Members, dispatchers, disabled accounts and support sessions cannot export. The supplier owner can deliberately share the private file outside the app; the app never sends it.

Files contain saved records only, explicit tonnes, self-declared relationships, self-reported availability at server export time, India expiry dates and UTC export time. Fleet registrations are intentionally private in this download. Profile contacts, account IDs, directory cards, driver documents, rates and accounting records are excluded. Empty lists produce headers only; oversized unsupported data fails without truncation. Read-only downloads never change publication, request receipts, version, history or finances. Unfinished fields remain intact; pending writes disable download until resolved.

Spreadsheet tradeoff: all cells are quoted; formula-like/control-leading values (including fullwidth and format-prefixed operators) receive a visible Text: prefix. This is a human-viewing CSV, not an import template or an unchanged round-trip archive. No universal spreadsheet execution guarantee is claimed; the UI states the transformation. Acceptance requires actual browser downloads/bytes on desktop and phone, saved-versus-unsaved distinction, privacy/authorization denials, failure with no file and unchanged draft/version/publication, plus existing supplier regressions.


## Reviewed fleet/route removal — 30 October 2026

Observed usability gap: Remove truck and Remove route immediately sent a saved-record deletion and hid the listing from one click. A supplier maintaining a fleet needs to review the specific saved registration/lane and consequence before changing saved data. The focused fix uses a native modal review with Keep focused first, explicit Remove saved truck/route and Escape cancellation. Review/Keep/Escape issue no request, hide no listing and preserve unfinished forms. Truck review explains the existing Not advertised alternative for retaining the record. It does not introduce archival or an undo promise.

Only explicit confirmation enters the existing owner-only versioned request/receipt path. Review closes before the write, so rejected/conflicting or unconfirmed results use existing visible error/reload/exact-retry controls. A same-account reload after a lost response retries the same already-confirmed request, not a new removal. Unknown/unsupported modal support fails closed without a confirm action. The saved snapshot label is independent of unfinished editor text. No endpoint, schema, role, provider, financial posting, bulk deletion or private-history access is added.

Acceptance: same-source measured desktop/phone review identity and consequence; safe initial focus/native keyboard confinement/Escape and focus return; Keep and cancel do not write or change publication; confirmed route removal preserves unrelated truck and unfinished route fields; server-version conflict preserves records and needs new review after reload; actual remove commit followed by injected503 and reload/same-request recovery confirms one removal/version without duplicate write. Existing Supplier, private export, directory, consent and authorization regressions remain required.


## Protect unfinished fleet/route editors — 30 October 2026

Observed gap: clicking Edit on a different truck/route or Cancel edit replaced a keyed uncontrolled form immediately. Existing tab/reload-saved preservation did not protect this switch. The fix compares the mounted form's current FormData and native bad-input flags to its original mounted baseline. A dirty switch opens a deliberate review defaulting to Keep editing. Keep/Escape preserves every value; only Discard fields & continue replaces the form. Clean switches and reselecting the same saved record do not interrupt the user. Checkbox/select/partial invalid-number edits count; changing back to the baseline is clean. Baselines are per mounted form in memory, not browser/shared storage, and parent/focus/minute rerenders or read reloads cannot redefine them.

Tabs continue to preserve forms without prompting. Successful explicit saves reset only their intended form. Editor switches/cancel are blocked while a write is busy/unconfirmed; existing exact-receipt recovery remains unchanged. Review/discard is a local editor action and never saves/deletes/publishes records, posts finance, grants roles or sends a message. The shared native review primitive retains the previously hosted safe focus, keyboard boundaries, Escape, centering and fail-closed behavior for both removal and draft-switch reviews. This does not provide browser-close/reload draft persistence or cross-record draft caching; users explicitly choose whether to discard a replacement-bound form.

Acceptance: actual measured desktop/phone new/edit/cancel/same-record/clean switches, Keep/Escape/default focus/keyboard confinement, checkbox/select and partial invalid numeric edits, explicit discard to saved/default values, other-tab form preservation, save-reset behavior and a real stale-version/read-reload that preserves both fields and dirty detection. Review/cancel/discard alone leave saved version/publication/financial state unchanged. Existing complete Supplier scenarios and unchanged production baseline/security requirements remain required.
