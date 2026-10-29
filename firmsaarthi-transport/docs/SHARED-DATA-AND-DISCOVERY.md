# Shared workspace data and Patna business research

## Consistency rules

- Current booking, vehicle, trip, GPS, document, finance, staff/payroll and account views use a shared successful-write invalidation path. Open tabs receive a payload-free BroadcastChannel notification and refetch using their own session. Foreground/focus/online changes refresh data; visible workspaces also refresh every 30 seconds to pick up changes made on other devices. This is refresh-based synchronization, not server-push real time.
- Registrations are normalized into the existing organization-scoped `trip_vehicles` registry. New consignments and XLSX imports add reference registrations in their transaction. Existing booking/import registrations are reconciled idempotently when reference data is read. This adds master references only; it does not rewrite original consignment text, invoices, ownership claims, financial amounts, document verification or historical snapshots. Invalid historical registration text remains untouched.
- Customer, supplier and route suggestions include recorded years, customer details and explicitly created party accounts. Exact historical names/financial aliases are not silently merged, reassigned or netted. Unused customer/supplier records do not fabricate financial balances.
- Forms retain draft state during background updates; versioned records still reject stale corrections. Profile drafts and due-term drafts are protected from refresh replacement. A workspace/account change forces a fresh page rather than carrying one business's draft into another.

## Business discovery

Release 31: Settings → Business details has an optional Interested city for finding business select, owned by the transport workspace rather than customer profiles. organizations.profile.interestedCity is validated against the existing 62-city catalog. Omitted values on older profile saves preserve the saved choice; blank/null clears it. Only existing owner profile authority can change it. No schema migration, provider API or new data access is introduced.

Find business receives that workspace preference and defaults to it, with All cities as the empty/invalid fallback. A user's current dropdown selection is not overwritten by a background refresh or another-device default change; revisiting the page applies the saved default. The profile, discovery selector and manual prospect city field share the catalog; the arbitrary-city text box is removed, superseding release 29's free-text exploration. An existing prospect location outside the list remains a disabled current option during edit, preserving historical text without permitting new arbitrary city input. Saved prospects and issued invoice snapshots are not rewritten.

Release 29 expands the curated list from 8 locations / 6 cities to 39 locations / 32 cities, with published phone/email contacts for 25 locations. These are locations, not 39 unrelated companies: branches and manufacturing units are labelled. There are 62 city suggestions plus arbitrary-city input. A city without researched records stays empty and offers external Maps searches, not fabricated leads. Text search covers all curated records before pagination (15 per page); saved prospects remain independently scoped and editable. The app does not call a live directory API, scrape search results or import external search pages.

Release 27 adds Patna (including labeled district works), Raipur, Raigarh, Angul, New Delhi and Patratu / Ramgarh, plus saved custom cities. Public phone/email links retain contact scope, official source and check date; missing contacts remain blank. The New Delhi corporate office is not a pickup plant. Private saved prospect contacts retain tenant/version boundaries and survive older clients omitting the new fields. This does not contact companies or establish verified demand.

The Find business tab focuses on the user's requested Patna industrial-goods market. It covers steel/TMT, cement/construction supplies and research in industrial estates, with explicit city-versus-district labels. Transport fit is planning guidance, not a company's stated requirement. Research checked 26 October 2026; linked historical documents remain historical.

Primary sources:

- BIADA industrial-area categories: https://biada1.bihar.gov.in/UploadFile/ActRule/2023/Apr/06-Apr-2023/IMG_e3b1cc44-23e8-48d7-95a5-fe2ee6480f1b.pdf
- BIADA Fatuha industrial layout: https://biada1.bihar.gov.in/Map/2025/Dec/09-Dec-2025/IMG_c6915140-7eac-47f7-90b7-fea17283a5d4.pdf
- Dina Mahabir Re-Rollers / Mahabir TMT, Patna company information: https://www.mahabirtmt.com/
- Magadh TMT official contact / Didarganj industries office: https://www.magadhtmt.com/contact/
- UltraTech / Aditya Birla annual report 2023–24, Patliputra Cement Works location: https://www.cms.adityabirla.com/uploads/ultratech_cement_limited_annual_and_sustainability_report_2023_24_b560b30c87.pdf
- Government cement-plant directory: https://eaindustry.nic.in/cement/report2.asp

These are research prospects, not verified active loads, tender invitations, credit checks or transport contracts. No outreach is sent. Website/Maps links are user-opened external resources; the app does not scrape Google Maps or claim a live company-directory API. Saving a prospect records it privately in the workspace. Explicit customer conversion reuses exact existing company names without overwriting their GST/address details; otherwise it creates customer details with blank GST and the researched location for the user to review. It creates no invoice or accounting balance. Schema-only migration 0016 adds the scoped lead table; research suggestions are code content, not seeded customer records.

Verification includes service tests for cross-year/tenant/role boundaries, registration identity, current suggestions, conversion idempotency/conflicts and unchanged invoice snapshots; local HTTP checks; and a two-browser-tab check that an added vehicle updates booking suggestions while preserving an unfinished booking draft. Only synthetic local data is used for mutation tests.
