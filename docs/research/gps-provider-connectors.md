# GPS provider connectors

Research and implementation checkpoint: 25 October 2026. Official documentation defines the adapter contract; no customer's provider account has been connected or tested.

## Recommended approach

Use provider adapters behind company-scoped connections and explicit provider-vehicle mappings. Keep GPS fixes separate from FASTag financial transactions, toll sightings and vehicle registration records. A registration number is not permission to track a truck. For hired trucks, the agency needs tracking access from the fleet owner/provider; its own subscription does not imply access to every subcontractor's device.

LocoNav is the first implemented read-only adapter because its official developer documentation provides a usable contract. WheelsEye is an onboarding option awaiting its approved specification. Neither is a free tracking service recommendation: device, subscription, API entitlement, account scope and commercial terms must be confirmed with the provider.

## LocoNav: implemented adapter, live account validation pending

Source: https://developers.loconav.com/ (Authentication and Vehicle Telematics sections, read directly in the official documentation).

- The provider's contact issues the account's User-Authentication token and test access. Do not use example tokens from documentation.
- Fixed global host: https://api.a.loconav.com.
- Read operation: POST /integration/api/v1/vehicles/telematics/last_known?page=1&perPage=50, JSON body with reviewed vehicleIds and sensors containing gps.
- Response envelope: success, data.values, data.pagination.more. Vehicle UUID and registration are checked against explicit local mappings. GPS latitude/longitude carry their own epoch-second timestamps; speed has a separate timestamp and documented km/h unit.
- Current implementation: manual synchronization, up to 100 mapped trucks, at most four pages, ten-second request timeout, two-MB response bound and one-minute connection cooldown. Redirects and arbitrary URLs are disabled. Unexpected UUIDs, plates, coordinate/time formats and duplicate vehicles are rejected.
- API response success and location freshness are separate. A successful response can contain an old fix. Historical fixes survive disconnection and errors. Repeated fixes are not reposted or silently rewritten; separately refreshed speed does not replace a stored coordinate observation.
- Not implemented: scheduled pulls, webhooks, historical routes, geofences, embedded map or regional endpoints. Confirm the supported host/account with the provider before production use. No outbound request to a real provider was used for QA; adapter tests use synthetic mocked responses.

## WheelsEye: onboarding only

Official enterprise support: https://wheelseye.com/help/ lists enterprisesolutions@wheelseye.com. No message has been sent. Official GPS terms: https://weye.in/web/site/terms-for-gps.

No official public API contract was established during this research. Logistrace records the connection name and access reference, explains the prerequisite, and does not collect a WheelsEye token or invent an endpoint. Request official API specification, authentication, vehicle identifiers, scopes, rate limits, sandbox/test access and commercial permission before implementing its adapter. Do not use private app endpoints, scrape login sessions, or rely on third-party reposted specifications.

## Credential operations and privacy

GPS_CREDENTIAL_KEY is a stable, random 32-byte base64 runtime secret in Sites, separate from source and local development secrets. Tokens entered by an authorized owner are encrypted with AES-GCM and bound to company plus connection ID. Browser state and business JSON backups exclude ciphertext, plaintext tokens and synchronization lease tokens. Disconnect removes the stored provider credential; received observations remain as history.

Never replace the encryption key casually: old tokens cannot be decrypted with another key. Planned rotation needs explicit re-encryption or owner re-entry, and an operational key-recovery procedure. The business JSON export is not a full credential or attachment restore mechanism. New vehicle documents and GPS pages are owner-only until finer operational roles and field restrictions are implemented. This does not fix the broader Member role's existing rate/invoice visibility.

## Next acceptance steps

Obtain an authorized pilot fleet account, confirm host/API entitlement and vehicle UUID/plate mapping, test failures and stale fixes against that account, then add provider-approved polling or webhooks with usage budgets. Preserve imports as a useful fallback. Track provider approval as an external prerequisite while continuing independent product milestones.
