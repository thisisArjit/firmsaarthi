# Physical trips and execution evidence

Update 26 October 2026: private owner-only POD attachments and file-specific manual accept/reject/correction history are implemented; see TRIP_DOCUMENTS.md for current behavior and limits. Earlier reference-only scope below is historical. Configurable stage requirements remain planned.

The first operational increment is published for hired trucks in version 14. The remaining specification below carries the original end-to-end vision forward. This is not a claim that all trip, evidence or accounting features are complete.

## First increment

- Consignments → Trips contains a compact all-years register, planning form and progress dialog. Plan with a trip number, recorded truck, supplier account and 1–50 unallocated consignments. A tenant-scoped registration record is created/reused; ownership is not inferred. All trips in this increment use hired trucks. Existing invoices do not prevent retrospective operational allocation.
- Preserve vehicle/supplier and consignment snapshots. An active primary allocation is unique per consignment; cancelled planned trips release allocation while retaining history. Physical booking details cannot change under an active allocation. A consignment with any trip history cannot be deleted. No extra transport cost is introduced on the trip.
- Members can plan, record departure/delivery, log exceptions and record resolutions. The owner reviews POD, closes, cancels planned trips and corrects the latest active event. Required references and reasons, optimistic versions, idempotent command keys, tenant guards and atomic writes protect the workflow. A truck cannot be concurrently dispatched on two active trips. Historical interval-conflict analysis and route scheduling are not implemented.
- Delivery and POD are separate per consignment. POD acceptance requires a document reference; rejection requires a reason. Trip closing requires all deliveries/PODs and no open exceptions. An unresolved exception is not silently cleared by delivery. The ready-to-bill queue shows accepted-POD consignments with no current invoice; customer terms and invoice review still apply.
- Actual timestamps require a timezone and cannot be in the future. Departure cannot predate its bookings; delivery follows departure; POD follows delivery/previous review; resolution follows its exception; closing follows active events. UI entry/display uses IST. Actual time, recorded time and actor remain distinct in history/CSV.
- Corrections append a new reasoned event and retain the original. Reverse the latest active event first, then earlier events if needed. Cancelling is limited to planned trips and cannot be undone; create a new plan using released consignments. Vehicle reuse can block reopening a close when the truck is currently dispatched elsewhere.
- Evidence is a **manual reference only** in this increment. No POD attachment upload, provider verification, public tracking link, geofence or automatic proof of delivery. GPS/EWB/FASTag imports remain separate. No actual bank transfers or provider calls occur.
- Register shows up to 300 recent trips and up to 500 eligible/ready consignments, explicitly labelled at the limit. Search/pagination and large-fleet scheduling remain future work. The record backup includes vehicles, trips, allocations and events.
- Existing P&L uses the same provisional consignment-date basis. Trip events do not recognize revenue, add supplier cost, settle balances or alter invoice taxes/snapshots. A recognition-policy transition still requires the separate review below.

Next priorities: expand evidence to authorized stored POD attachments and correction workflows; searchable operational exceptions and unbilled queue; reconcile provider-cost completeness/supplier identity; then preview a controlled recognition-policy transition. Shared hired-trip cost allocation, transshipment/returns, owned fleet, driver/vehicle document masters and provider-linked movement remain future work.

## Intended workflow

Create a physical trip → select a tenant-owned vehicle record and hired provider account → allocate one or more consignments → dispatch → record departure/in-transit exceptions → record delivery for each consignment → review delivery evidence/POD → close the trip. An invoice and a cash settlement remain separate records. A GPS/toll observation is evidence of an observation, not automatic proof of delivery or performance completion.

Keep an immutable timeline of actual event time, recorded time, actor, evidence reference and correction history. Distinguish planned times from actual times. Future actual events are invalid. Store timestamps with a timezone; display the company's timezone explicitly. Use optimistic versions for allocation and state transitions. Cancellation and corrections need reasons and cannot silently remove linked financial or document history.

## Data and integrity

- A trip has a stable tenant-scoped ID/number, vehicle ID/snapshot, hire mode, supplier party ID/snapshot, planned route/times, lifecycle state, version and audit metadata. Vehicle masters retain registration identifiers and change history. Do not infer vehicle ownership from a registration number.
- A consignment remains the commercial record. A trip allocation connects it to physical movement. First support one active primary movement per consignment with multiple consignments per trip; transshipment/multiple legs need an explicit later model rather than duplicated active allocations.
- Delivery and POD states are per consignment, because multi-drop trips may be partly delivered. Closing requires all relevant deliveries/evidence or a documented exception. Persist origin/destination/truck/provider snapshots at assignment so later master edits do not rewrite operational history.
- Evidence must reference tenant-authorized stored assets or explicit external document references. Do not fetch arbitrary external URLs from the server. Evidence access follows company membership and does not make delivery photos or location history public.
- Track cost completeness and responsibility. A hired-trip charge allocated among consignments must reconcile to the single agreed cost; the trip and each consignment must not both expense the same amount. Existing consignment costs need a reviewed transition. Additional toll/fuel costs require confirmation that the company bears them and they are not already included in hired freight.
- Model owned vehicles explicitly when their running-cost allocation is implemented. Do not substitute hired freight for owned-fleet fuel, toll, driver, maintenance, insurance and depreciation.

## Financial transition

First publish operational evidence without silently changing old P&L. The existing report explicitly uses consignment dates provisionally. A later recognition policy needs a documented company choice, effective/cutover period, handling of in-transit/partly completed services, principal/agent policy and accountant-reviewed examples. Delivery/POD alone must not be presented as a universal accounting rule.

Show report basis and completeness: booked versus operationally completed versus billable, missing service evidence, missing supplier cost, unbilled completed freight, and unreconciled settlements. Historical issued invoices and closed periods must remain reproducible. Any recognition-date transition must show its period-by-period effect before activation and preserve the old basis for comparison. It must not change invoice taxes or rewrite issued documents.

## Acceptance gates

Verify tenant/role isolation, vehicle/party scope, duplicate allocations, stale edits, invalid state transitions, timestamp ordering, multi-consignment partial delivery, evidence access, reasoned corrections/cancellation, and retained history. Verify one hired cost allocated across several consignments still totals once in company P&L, and that customer/provider advances, partial receipts, salary payments and toll imports remain financially separate. Browser-check dispatch, partial delivery, evidence review and the owner's exceptions queue. Use synthetic local data; no production test trips or fabricated provider positions.

Continue provider-neutral import/export and adapters while authorized provider access is unavailable. Link GPS positions, EWB references and FASTag debits by stable tenant vehicle/trip IDs as genuine connections become available. Keep their provenance/freshness and access status visible.
