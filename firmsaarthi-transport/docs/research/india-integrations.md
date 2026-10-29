# India transport integrations: verified access and product decisions

Latest implementation: [GPS provider connectors](gps-provider-connectors.md) documents the implemented LocoNav read-only adapter and WheelsEye specification prerequisite. Manual synchronization is implemented; no real provider account is connected. The older rollout below remains a roadmap for unattended synchronization, EWB and FASTag access.

Research date: 25 October 2026. Scope: e-way bill, FASTag, GPS/telematics. Sources are official government/operator/provider pages. No API was called and no commercial account or production integration was activated. Product architecture and rollout recommendations below are inferences, explicitly separate from verified capabilities.

## Executive decision

Build an integration-neutral transport operations and finance model now. Start with manual entry and validated imports; add one contracted provider in each category. Never label a connector as connected until credentials, account scope, and a successful provider response have been verified. Treat GPS positions, toll-plaza sightings, and financial toll transactions as three distinct data types.

## 1. E-way bill: real APIs, controlled onboarding

NIC publishes APIs for generation, Part-B updates, consolidated bills, cancellation, rejection, transporter updates, validity extension, and retrieval. Assigned-transporter retrieval is available. These are controlled interfaces, not anonymous public endpoints. See the [official developer portal](https://docs.ewaybillgst.gov.in/apidocs/index.html).

**Direct NIC prerequisites:** automated invoicing; approximately 10,000 EWB transactions generated or updated per month per GSTIN; an SSL/TLS domain; preproduction system/testing; and a maximum of three whitelisted Indian static IP addresses. These are the current published prerequisites; older FAQs mention different volume thresholds. Use the current NIC page when evaluating eligibility: [prerequisites](https://docs.ewaybillgst.gov.in/apidocs/pre-requisites.html).

**Onboarding:** NIC describes sandbox access, testing with a test-summary report, formalities including IP whitelisting, and production access. Direct users create API logins under Registration → For API. Users taking the GSP route select Registration → For GSP and create credentials for the chosen GSP. Separate business locations may share a client identity but still need their own user credentials. [NIC onboarding process](https://docs.ewaybillgst.gov.in/apidocs/on-boarding-process.html).

**Recommended route:** obtain ASP/SaaS commercial access through a GSP for the first small-operator tenants. This is a product recommendation, not a finding that any vendor has approved Logistrace. Vayana documents a GSP interface with separate sandbox/production paths, ASP authentication/signature headers, and encrypted EWB authentication payloads. Its examples refer back to NIC rather than implying every NIC operation has identical provider semantics. Obtain current terms, credentials, supported operations, pricing, and sandbox contract before implementation. [Vayana authentication documentation](https://docs.gsp.vayana.com/E-Way-Bill/eway-bill-authentication/), [Vayana API ecosystem](https://docs.gsp.vayana.com/api-ecosystem/).

**Fresh regulatory/API change to avoid implementing incorrectly:** NIC's 30 July 2026 release notes say EWB Closure and mandatory Ship-to GSTIN changes are on hold; the 22 May 2026 changes are marked withdrawn. The same release notes describe generation within 180 days of the document date and a 360-day extension restriction effective January 2025, and the newer encrypted authentication replacing the old authentication API. Recheck rules and schemas before enabling production writes. [NIC release notes](https://docs.ewaybillgst.gov.in/apidocs/release-notes.html).

**Product scope:** capture existing EWB number/document linkage and expiry first. Later add fetch, Part-B vehicle changes, assigned-bill synchronization, and authorized generation. Preserve the upstream issuer, status, validity timestamp, raw-response reference, and retrieval time. Treat portal-imported/manual values as unverified. A goods invoice that underlies an EWB must remain separate from Logistrace's transport-service invoice. Do not manufacture goods HSNs/quantities from freight charges.

## 2. FASTag: finance and movement visibility have different access paths

FASTag is RFID toll collection. IHMCL explains that toll statements can be provided online/by email, while NPCI operates clearing and settlement with issuing/acquiring institutions. The FAQ also contains dated operational examples, so do not hardcode its bank counts or listed legacy issuers. [IHMCL FAQ](https://ihmcl.co.in/faq/).

### A. Toll expense and wallet reconciliation

Start with customer-supplied issuer statements. For automated reads, contract with the customer's issuer bank or a provider that can establish lawful, account-scoped access.

Axis Bank's official developer index lists **Toll Transactions API** for a date range, **Tag Wallet Balance API**, and tag-operation/recharge APIs. The FASTag product itself is restricted: account/sign-in and bank engagement are required; its published checklist includes security assessment, a signed SLA, banking setup, and possible vendor audit. The checklist addresses the wider partner/issuance product, so confirm which items apply to a read-only finance integration. This is evidence of an available commercial route, not proof that a new SaaS can self-subscribe or obtain all-bank history. [Axis FASTag product](https://apiportal.axis.bank.in/portal/product/36669), [Axis official API descriptions](https://apiportal.axis.bank.in/portal/forum/4).

Financial acceptance criteria: verified account/vehicle ownership; transaction ID, event time, amount and currency; reversals/refunds; reconciliation status; duplicate prevention; and explicit trip allocation. Wallet top-ups are transfers into a prepaid balance, not toll expenses. A toll passing seen in a tracking feed must not automatically become a second expense when its bank debit already exists.

### B. Toll-plaza sightings / track and trace

The [ULIP portal](https://goulip.in/) lists IHMCL FASTAG among its integrated systems and requires sign-in/registration to request APIs. A government [PIB release](https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=1910298&lang=2&reg=48) confirms a registration → reviewed use-case process, NDA-based data access, and an actual FASTag road-tracking use case. The release is from March 2023; use it as onboarding/capability evidence, not current API counts or a promise about present field coverage.

**Important limitation:** a toll-plaza observation is an event at that plaza/time. It cannot establish a continuous live location between tolls. The public official pages reviewed did not establish that ULIP supplies wallet balances, paid amounts for every event, unrestricted access to any vehicle, guaranteed latency, or a specific lookback window. Ask ULIP for approved current API documents and retention/use restrictions. Do not copy endpoints or tokens from third-party repositories or leaked/reposted integration PDFs.

Proposed UI labels: “GPS position — observed at …”, “Last toll sighting — …”, “FASTag statement debit — …”. Show observed time and received time separately; do not interpolate a truck icon from a toll sighting as though it were live GPS.

## 3. GPS/telematics: practical provider choices

### LocoNav: documented REST and webhooks

[LocoNav's developer documentation](https://developers.loconav.com/) describes vehicle telematics, GPS, REST APIs and live-location/alert webhooks. Tokens and test access come from the customer's LocoNav point of contact; the `User-Authentication` header is used. Its published usage notes include epoch seconds, paginated lists, and throttling above 500 requests per endpoint in a rolling 60-second window. Webhook receiver registration is arranged with the provider. Public docs do not establish Logistrace's commercial redistribution rights, hardware costs, or production SLA; obtain those in writing.

Recommendation: choose this as a candidate first GPS adapter when a pilot customer already has compatible LocoNav devices/account. Map provider vehicle identifiers to tenant-owned vehicles; start read-only. Do not expose remote immobilization or unrelated driver identity fields merely because an API offers them.

### Fleetx: supported account-scoped access, confirm SaaS terms

Fleetx's [13 October 2026 announcement](https://blog.fleetx.ai/fleetx-mcp-bring-your-fleetx-data-into-claude-chatgpt-and-your-own-agents/) describes hosted MCP at `https://mcp.fleetx.io/mcp`, account-linked sign-in, permissioned access, and APIs enabled by customer modules. It says the API reference is available after authenticated access. This confirms a supported integration conversation, but does not supply a verified public REST payload contract for Logistrace. Obtain the customer's module/access scope and contractual permission before building a REST adapter. Do not confuse Indian Fleetx (`fleetx.ai`/`fleetx.io`) with unrelated `fleetx.com` search results.

## 4. Proposed architecture

These are Logistrace design recommendations, not upstream API guarantees.

- A tenant-scoped connector has provider, capability list, environment, status, secret reference, account scope, last success/error, and configuration version. Secrets remain on the server, encrypted at rest, outside browser bundles and logs.
- Backend workers synchronize data. Maintain provider-specific adapters behind internal EWB, position, toll-sighting, toll-transaction, and wallet interfaces. Avoid a catch-all “tracking integration” that confuses sources.
- Store an ingestion envelope: tenant, provider connection, upstream ID, observed time, received time, payload digest, normalized record, and raw-payload reference with controlled retention. Unique constraints make replay safe.
- Use queues, rate-limit budgets, bounded retry/backoff, dead letters, and reconciliation jobs. Read timeouts may retry; regulatory writes with ambiguous outcomes need status lookup/manual reconciliation before retrying.
- Show status explicitly: not configured, awaiting provider approval, sandbox, connected, stale, error, revoked. Manual/imported data remains usable when an integration is unavailable.
- Approvals and authorization apply before regulatory writes; log the user, source document, submitted version, external acknowledgement, errors and final status. Never claim an EWB was generated without upstream acknowledgement.
- Imported toll debits become reviewable finance candidates; accountant approval and unique source linkage control posting. Track reimbursement/provider inclusion so subcontracted freight and tolls are not counted twice.

## 5. Rollout and external prerequisites

| Priority | Deliverable | External prerequisite / acceptance |
|---|---|---|
| P0 | Manual EWB register, positions, toll statement import; connector status model | No provider secret required; clear provenance and duplicate checks |
| P1 | One read-only GPS adapter | Pilot fleet account, approved token/test access, vehicle mapping, freshness/error tests |
| P1 | One issuer statement parser and reconciliation | Real anonymized statement format, refund/duplicate fixtures, expense review |
| P2 | GSP-backed EWB fetch and authorized actions | GSP contract, tenant GSP credentials, sandbox certification and production approval |
| P2 | ULIP toll sightings | Organization registration, reviewed use case, NDA, granted scopes and current API spec |
| P3 | Bank FASTag transaction/balance API | Issuer agreement, security onboarding, account-scoped credentials, tested reversals |

Do not advertise every integration as live while access is pending. Integration cost, per-call pricing, device cost, tax treatment, provider SLA and customer willingness to pay remain unvalidated commercial inputs.
