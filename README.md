# logistrace
Logistics done E2E

## FirmSaarthi source

The original root Transport snapshot is retained for history. Current source lives in distinct product folders:

| Folder | Status |
| --- | --- |
| [firmsaarthi-transport](firmsaarthi-transport) | Production 46; administrator directory, email OTP and Razorpay released |
| [firmsaarthi-transport-development](firmsaarthi-transport-development) | Unpublished development branch; do not deploy over stable production |
| [firmsaarthi-home](firmsaarthi-home) | Published brand homepage |
| [firmsaarthi-inventory](firmsaarthi-inventory) | Local prototype only; 45 local tests, hosted release gate pending |
| [firmsaarthi-transport-android](firmsaarthi-transport-android) | Internal client only; not Play-published |

Production Transport source is firmsaarthi-transport; the development folder contains unfinished work and must not replace it without reconciliation and the staging gate. Inventory is not hosted or advertised. Android is not Play-published.

See SOURCE-SYNC.md for snapshot provenance. No credentials, databases, uploaded customer documents, build archives or automatic deployment workflows are included. Hosting secrets and data remain in their existing environments.
