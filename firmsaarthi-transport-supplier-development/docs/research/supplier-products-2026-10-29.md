# Truck supplier product review — 29 October 2026

Official pages reviewed in this run. These are documented product patterns, not evidence that FirmSaarthi has provider integrations, equivalent scale, verified trucks or active demand. No competitor assets or marketing claims are copied.

| Official evidence | User job / useful pattern | FirmSaarthi decision and gap |
| --- | --- | --- |
| [TruckSuvidha registration](https://trucksuvidha.com/Register) separates Transporter, Truck Operator, Customer and Driver categories | An owner supplying trucks is a different job from a load provider or transport operator | Explicit supplier entrypoint/new-workspace mode. Existing transporter identity remains intact. Demand and driver access are not enabled implicitly |
| [TruckSuvidha truck posting](https://www.trucksuvidha.com/TruckPosting.aspx) documents truck type, metric-tonne capacity, vehicle number, schedule and from/to fields | Express capacity and lanes in a structured way | Private registration plus equipment/payload, dated self-reported city availability and preferred directional routes. Driver identity/mobile are deliberately excluded from shared cards |
| [Truckstop carrier management](https://truckstop.com/blog/carrier-management/) describes carrier profiles and searching by lanes/equipment with qualification as a separate concern | Find a suitable business, then assess suitability | Consent-based authenticated directory with route/equipment/payload filters. No carrier-safety, ownership or compliance verification claim |
| [Truckstop carrier API documentation](https://developer.truckstop.com/reference/expanded-carrier-api-detail-of-results) distinguishes profile/operating-area/equipment information and email-contact consent | Profile data and permission to contact must not be conflated | Supplier reviews business contact before publishing; publication is separate from sending a message. No external API connection is configured |
| [BlackBuck official load-search guide](https://blackbuckcare.freshdesk.com/support/solutions/articles/81000386307-how-to-find-a-load-) (older guide, modified December2022) describes loading/unloading search followed by contact/bid/booking | Supply discovery and a completed transaction are separate steps | First slice ends at supplier contact. Do not present non-existent loads, bids, awards or bookings |

Current gap matrix: own fleet and lanes, explicit publication and transporter contact discovery are the first staged increment. Consent-based document review, enquiries/abuse controls, rate submissions, booking handoff and completed-trip reviews remain planned. Rates, demand, driver documents and provider tracking are not seeded to make the product appear complete.


## Follow-up evidence — 30 October2026 IST

Re-read the official [TruckSuvidha truck posting page](https://www.trucksuvidha.com/TruckPosting.aspx): equipment, payload, scheduled date and directional cities remain documented inputs. This supports treating availability as dated supply information; it does not establish FirmSaarthi live stock, demand, verification or competitor update guarantees. Do not copy the site's real postings, driver details or verification claims.

Technical primary documentation: [MDN AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) documents cancellation of fetch requests/body consumption. We use this only for replaceable discovery GETs, with an additional generation guard for late results. Mutation receipt/recovery remains separate and is not cancelled/reissued. Product decision: refresh on return/manual action and show the actual server-read time; preserve unfinished search fields and clear unconfirmed contacts on errors. No perpetual polling or third-party integration is added.

## Saved readiness / availability review — 30 October2026,04:20IST cycle

Official [Transport Pro Active Capacity guide](https://www.transportpro.net/support/active-capacity/) distinguishes posting age, carrier contact and available date, and cautions that an older posting indicator does not mean no carrier matches exist. Adopt the general separation of fleet/business presence from fresh capacity: show expired availability clearly, keep busy/expired fleet distinct from currently available counts, and guide the supplier to review. FirmSaarthi does not implement that vendor's dispatch/exchange matching, geography assumptions, price insights or integrations.

Official [Truckstop FAQ](https://truckstop.com/frequently-asked-questions/) describes truck posting as making equipment and availability visible; access to private freight depends on a separate approval relationship. Adopt explicit profile review/publication rather than implying that completing a checklist verifies the supplier or produces a booking. Do not transplant US authority requirements, payment products, paid subscriptions or vendor performance claims into this India-oriented preview.

Current gap matrix addition: saved-step guidance and a shared honest availability/preview label are implemented locally; fresh review consent is reset by confirmed saves. Hosted validation/private publication remain required before marking this increment delivered. Enquiries/abuse/staff permissions remain next design work; demand, bids, KYC and contracts are still not invented.


### 30 October 2026 official-source review: controlled own-data export

[Vehicle overview, Fleetio](https://help.fleetio.com/en_US/vehicle-overview) (updated 10 March 2026) links vehicle-list Export CSV to [Working with your data on an index page](https://fleetio.helpjuice.com/en_US/fleetio-basics/working-with-your-data-on-an-index-page) (updated 26 February 2026). Its documentation separates viewable records and explicit Export permission. Useful job: carry your own saved fleet data to a spreadsheet. Adaptation: only the enabled current workspace owner downloads their saved fleet/routes; no directory bulk export, financial posting, paid integration or competitor asset reuse.

[OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection), reviewed 30 October 2026, covers ASCII/fullwidth formula prefixes and control/separator issues; quoting alone is insufficient and spreadsheet/resave behavior varies. Decision: quote every field and prepend visible Text: to formula-like/control-leading values, including Unicode format-prefixed operators. Explicitly label these files for human viewing, with altered guarded values and no import guarantee. Parser/unit tests are not evidence of Microsoft Excel execution/resave testing.

Gap matrix: owner-private saved CSV delivered on private stage32 after18 same-source hosted Supplier checks, including actual downloads on measured desktop/phone. No public release. XLSX/PDF/import, delegated export permissions, enquiries/abuse and staff management remain future complete workflows. Directory/contact export is deliberately unavailable.


### 30 October 2026,08:20 IST review: deliberate fleet removal

Official [Fleetio archive/restore/delete guidance](https://fleetio.helpjuice.com/vehicles/archive-restore-or-delete-vehicles), updated 8 May 2026 and reviewed today, distinguishes reversible retention from permanent deletion and scopes deletion permission. Useful job: intentionally retire capacity without accidental record loss. FirmSaarthi currently has Not advertised for retained trucks and actual removal from its separate Supplier saved list. Adaptation: review the saved truck/lane and listing-hiding consequence, default to Keep, retain existing owner-only checks/receipt recovery and explain Not advertised for trucks. No Fleetio archival, restoration, billing integration or proprietary assets are copied or claimed.

[MDN dialog element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), reviewed today, documents showModal, native focus/modal behavior and cancel events. Use native modal behavior and explicit safe-action focus; unit stubs are not proof of native keyboard behavior, which needs hosted browser checks on both measured viewports. Unsupported modal opening fails closed.

Gap matrix: reviewed individual removal accepted on private stage34 after20 exact-source hosted Supplier checks; first stage33 focus failure and stage34 harness timing failure are retained and repaired/retested. Bulk removal, archive/undo, enquiry/abuse and staff permission design remain unbuilt. Original public-release prerequisites remain unchanged.

Private stage33 acceptance found a native keyboard-focus assertion failure; its failed evidence/screenshot are retained. The retained screenshot also showed the modal against the viewport edge. The candidate adds explicit Tab boundary wrapping and modal auto margins; new-source full checks and both hosted viewports must be rerun before acceptance. Native modal support is not a substitute for measuring behavior in this application.


### 30 October 2026,10:25 IST review: unfinished record edits

Re-read official [Fleetio Vehicle overview](https://help.fleetio.com/en_US/vehicle-overview), updated 10 March 2026: fleet work is organized around individual vehicle records and explicit editing. Useful job: move between records while correcting capacity and availability. This does not imply that Fleetio implements our exact discard guard or any undocumented draft retention.

[GOV.UK Check answers](https://design-system.service.gov.uk/patterns/check-answers/), reviewed today, recommends preserving/prepopulating information when users change earlier answers. [MDN FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData) documents reading a form's key/value entries. Adaptation: preserve existing tab-mounted fields, compare to a per-form baseline and ask before a switch would replace unfinished input, including native bad-input state. Explicit discard is separate from saving; no automatic persistence/publication or competitor assets/claims are introduced.

Gap matrix: unfinished-editor switching guard delivered on private stage35 after22 exact-source hosted Supplier checks. A positional-record harness failure was retained and corrected with stable saved-registration locators; all current checks passed fresh. Browser-close/reload draft persistence, per-record draft caching, staff/enquiry/abuse and public signup ownership foundations remain unbuilt or gated.
