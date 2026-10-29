Current stable Transport: production47, source163bb92c0de750d93ce6290ff4a7c057217662b4. See [security review and release evidence](firmsaarthi-transport/docs/SECURITY-REVIEW-2026-10-29.md) and [current synchronization](SOURCE-SYNC.md). Inventory remains local/unpublished; backups do not deploy.

# logistrace
Logistics done E2E

## FirmSaarthi source

The original root Transport snapshot is retained for history. Current source lives in distinct product folders:

| Folder | Status |
| --- | --- |
| [firmsaarthi-transport](firmsaarthi-transport) | Production 46; administrator directory, email OTP and Razorpay released |
| [firmsaarthi-transport-development](firmsaarthi-transport-development) | Unpublished development branch; do not deploy over stable production |
| [firmsaarthi-home](firmsaarthi-home) | Published brand homepage |
| [firmsaarthi-inventory](firmsaarthi-inventory) | Local prototype only; 51 local tests, native entrypoint and hosted release gate pending |
| [firmsaarthi-transport-android](firmsaarthi-transport-android) | Internal client only; not Play-published |

Production Transport source is firmsaarthi-transport; the development folder contains unfinished work and must not replace it without reconciliation and the staging gate. Inventory is not hosted or advertised. Android is not Play-published.

See SOURCE-SYNC.md for snapshot provenance. No credentials, databases, uploaded customer documents, build archives or automatic deployment workflows are included. Hosting secrets and data remain in their existing environments.
