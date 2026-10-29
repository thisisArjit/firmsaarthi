# Team access

Implemented 25 October 2026. Access is checked on the server for every request. A role is company-wide; branch, assigned-truck, employee self-service and customer link scopes are not implemented.

| Capability | Owner | Commercial member (existing MEMBER) | Dispatcher |
|---|---|---|---|
| Booking number, date, customer, truck and route | Yes | Yes | Read |
| Booking creation/amendment and commercial rates | Yes | Existing access | No |
| Plan hired trips from existing bookings | Yes | Yes | Yes |
| Departure, delivery, exceptions and resolutions | Yes | Yes | Yes |
| Review POD, close, cancel or correct trips | Yes | No | No |
| Require accepted POD files when planning a new trip | Yes | No | No |
| Upload, list, download and review private POD files | Yes | No | No |
| Freight, advances, invoices, receipts and supplier cost/payment records | Yes | Existing access | No |
| Company reports, overheads, staff/payroll, accounts administration | Yes | No | No |
| GPS connections/positions, vehicle documents/private attachments, imports | Yes | No | No |
| Team accounts, roles, password resets and owner backup | Yes | No | No |
| Change own password / sign out | Yes | Yes | Yes |

## Owner workflow

Settings → Team & access shows the role description beside account controls. New accounts default to Dispatcher. Owners may explicitly choose Commercial member when that person needs the existing rate/invoice/supplier visibility. Existing accounts retain their current role; publication does not change anyone's access.

Change role checks the current role before updating, refuses owner/self-owner modification and other-company targets, records old/new role plus actor in the owner audit export, and invalidates the target's sessions. A fresh sign-in is required. Passwords and issued invoices are not changed. The owner backup now includes the company team roster (IDs, emails, roles and joined dates), without authentication hashes/session tokens. It remains a record export, not automated restore.

## Dispatcher boundaries

The default state query selects an explicit list of operational consignment columns and returns no business profile, invoices, company master details or team roster. Trip lists/details project financial fields out of booking snapshots and current records. Invoice IDs/current freight and billing-ready queues are not returned to dispatchers. Trip planning and event validation retain company reference checks and owner-only evidence decisions.

Dispatcher API access is allowlisted to operational state, trip register/detail and trip creation/progress commands. Invoice/receipt/supplier reports, financial downloads, staff/payroll, assets, GPS, imports, profile and team commands are rejected. Unknown role values fail closed. Client navigation is additional usability control; hiding a button is not the authorization mechanism.

Operational customer/carrier names, routes and manually entered trip notes/references are shared with dispatchers. Avoid placing salary, bank or confidential price details in these operational free-text fields. This is not content-based redaction, a branch/assignment boundary, or a mechanism to erase information a person already received under an earlier role. Session invalidation blocks subsequent authenticated requests; an already authorized in-flight response is not recalled.

## Remaining roles and release checks

Accountant, read-only operations, employee-only salary access, custom permissions and assignment/branch scopes remain planned. Commercial member intentionally preserves the prior broader commercial access; it is not an accountant-only role. GPS/provider credentials and sensitive document access stay owner-only pending dedicated permissions.

Verification covers operational field projections, blocked command families, financial URL/download attempts, company isolation, unsupported roles, stale role changes, owner protection, session revocation, unchanged accounting and successful trip events. Browser QA uses disposable local synthetic accounts; production memberships are not altered for tests.
