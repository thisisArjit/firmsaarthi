# What a truck registration number can provide

Checked 25 October 2026 at the user's request. Research only: no lookup against an actual vehicle, no CAPTCHA/OTP bypass, no new API entitlement and no product connection was activated.

## Decision for Logistrace

Free citizen/manual lookup is useful for reference checks. It is not a verified free commercial API for automatic fleet enrichment. Do not build a production dependency on scraping citizen apps or undocumented endpoints. A user-supplied registration number identifies a record; it does not prove vehicle ownership, authority to access private data or authenticity of the physical truck/plate.

## Published basic fields

MoRTH's National Transport Repository data-sharing policy lists the citizen RC view as vehicle number, registering authority, vehicle class, fuel type, emission norm, hypothecation indicator, registration date, insurance valid-until, PUCC valid-until and vehicle status, with restricted/masked ownership-related information. Its citizen-access section specifies mobile OTP and a limit of three daily accesses. This is the published baseline, not a claim that every record or every app screen currently exposes every field. The policy's richer agency dataset is not the unrestricted citizen dataset.

Sources: [official policy](https://morth.nic.in/sites/default/files/circulars_document/Data-Sharing-policy-20082025-merged.pdf), [official circular listing](https://www.morth.gov.in/en/Circulars-Notifications-related-to-MVL). The PDF's indexed official text was available; direct PDF fetch intermittently failed. Policy access limits were not tested by performing live vehicle searches.

[NextGen mParivahan terms](https://mparivahan.parivahan.gov.in/privacy-policy.html) describe a free app, general-reference information unless otherwise specified, supported interfaces and restrictions on unauthorized/nonpersonal exploitation and automation. Free app access does not establish permission for Logistrace to resell or scrape its service. Full own-vehicle RC access through mParivahan/DigiLocker is a separate authenticated owner flow.

## Conditional and separate checks

- Manufacturer/model and fitness validity are mentioned on the [Odisha Transport mParivahan information page](https://odishatransport.gov.in/content/mParivahan/7). They are not in the newer policy's baseline citizen-field list. Permit, tax, payload, body configuration, axles and full certificate details must not be promised for every free number-only search. Use authorized RC/permit/fitness/insurance documents or an approved provider contract, preserving provenance.
- [IHMCL's FAQ](https://ihmcl.co.in/faq/) points to the [NPCI tag-status check](https://www.npci.org.in/what-we-do/netc-fastag/check-your-netc-fastag-status) for tags linked to a vehicle. This supports a manual status-check route, not an open transaction/location API. The NPCI page requires JavaScript; no actual plate lookup was performed. Exact wallet balances, transactions, refunds and toll sightings need a separate authorized source. A wallet sufficiency color is not a numeric account balance.
- Challan checks may require more than the plate. The [Maharashtra official portal](https://www.mahatrafficechallan.gov.in/payechallan/PaymentService.htm) explicitly asks for the last four chassis/engine digits along with the vehicle number. Do not advertise complete national challan history from the truck number alone.
- Live GPS, continuous route history, current driver, current cargo, exact wallet balance, owner's phone/address and full engine/chassis identity are not a verified free public number-only data source. No free unrestricted commercial RC API was verified in this research. Do not interpret that as proof that every approved API route is paid; terms/fees/eligibility need written confirmation from the relevant source.

## Implementation implications

1. Build a vehicle document register with source, checked-at timestamp, recorded expiry, reviewer and correction history. Keep unknown, owner-supplied, manually checked and provider-verified states distinct.
2. Offer links to official manual checks. Any OTP/CAPTCHA stays in the official user's flow. Do not proxy private user credentials or claim checks have occurred without evidence.
3. Accept authorized documents for richer data; extract proposed fields for review rather than asserting verified status from OCR. Calculate local age/expiry reminders only from sourced dates.
4. Add automatic retrieval only after approved provider access and payload/terms/retention review. Verify storage/location requirements before persisting newly obtained government data in the current hosting environment.
5. Apply the requested role split: dispatcher access to necessary movement/vehicle compliance, restricted financial/ownership details. Current Owner/Member roles are too broad for field-level separation; do not claim this split is implemented.
