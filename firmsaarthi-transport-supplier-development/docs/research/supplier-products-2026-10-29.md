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
