# Private POD evidence

Implemented 26 October 2026. Trips → Open trip → Private POD documents. The initial workspace default permits optional files; owners can configure required accepted files for new trips. This is manual business evidence policy, not government verification.

## Required files for new trips (release 26)

- In Plan trip, the owner chooses reference/optional-file policy or an uploaded-and-accepted POD file for every consignment. The versioned policy is immutable on that trip. Existing trips receive the constant reference_v1 default, preserving original creation payloads, events, versions, paid/financial records and manual workflow. There is no silent migration or exception bypass.
- file_v1 trips reject reference-only acceptance server-side. Every consignment needs an active owner acceptance linked to its own private uploaded file before closing. Upload alone, rejected files or corrected acceptances do not qualify. Partial delivery remains supported; per-trip missing-file counts and item statuses explain the remaining work.
- Ready-to-bill suggestions use the same file requirement for required-file trips. This is not an invoice-generation hard gate or a new revenue-recognition policy: contractual invoice decisions remain in Billing and existing invoices are unchanged.
- Commercial members/Dispatchers can see operational requirement/completion counts, not file metadata/downloads. They may inherit a required workspace default but cannot choose owner-only explicit overrides or upload/review files. No real user's permissions changed. Placement/loading/arrival gates and delegated document roles remain future work.
- Schema-only migration 0021 adds the constant-default policy column and validity/immutability guards. Upload/review/close share trip-version concurrency control. Old trip creation retries keep their exact original payload semantics.

## Workflow and boundaries

- Workspace OWNER uploads, lists, downloads and reviews actual POD files. Commercial members and Dispatchers retain operational reference history, but receive no file list or file access. No new real-user permissions are assigned. Future uploader/reviewer delegation requires explicit capabilities and tests.
- A delivered consignment on an open/dispatched trip accepts PDF, PNG or JPEG, non-empty and at most 2 MB. The multipart request is bounded to 3 MB. MIME and leading signatures are checked; no OCR, malware-scanning guarantee or independent authenticity check is claimed. Downloads use attachment, no-store, nosniff and sandbox headers. Do not use this flow for KYC, identity or bank documents.
- Upload retains the original immutable file, SHA-256, byte size, original name, uploader, recorded time and trip/consignment association. A stable request ID rejects changed payloads and makes completed retries idempotent. Twenty files per consignment bound replacement history; there is no silent purge. Retention/deletion policy and archival remain future work.
- Upload does not accept POD. Owner file reviews use the existing append-only POD accept/reject events, with a scoped immutable link to the exact file. Rejection requires a reason; review cannot predate upload. Existing manual reference-only reviews remain available and historical records are untouched. Acceptance still requires delivery and follows the existing trip-close and ready-to-bill rules.
- Uploading after an accepted POD requires explicitly rejecting or correcting that acceptance first. Replacements are new records; prior rejected files and review reasons remain. Latest-event correction retains the review event and link; its decision ceases to be active. A prior decision on another file remains historical, while the latest active consignment POD decision controls trip progress. Upload does not undo a review automatically.
- A single trip-version claim guards each upload/review against concurrent progress changes. R2 is written under a unique key per attempt; losing/failed database batches delete only their own attempted object. A process failure between object write and database commit could leave an unreferenced object; periodic orphan reconciliation is not implemented yet. Such an object has no authorized download route.
- Scoped assets cannot be reused as company logo/QR or newly embedded in issued invoice images. Unknown scopes fail closed on download. Owner-only JSON backup includes file metadata and review links, not file bytes; it is not a complete R2 restore artifact.

## Integrity and next increment

### Published workspace POD defaults (release 40, 27 October)

Owners configure the default in Settings → Trip evidence. New trip planning captures workspace_v1 and an explicit policyVersion, or an owner selects an explicit per-trip override. Weakening a required-file default requires a recorded reason. Members/dispatchers may inherit the required mode without receiving private-file review access. Existing timelines keep their saved requirement.

The immutable creation_payload stores podPolicyRequest and podPolicySnapshot alongside the immutable effective pod_policy. Append-only workspace_pod_policies revisions and trigger-only source/selection guards preserve tenant ownership, currentness at creation, mode correspondence and owner override authority. Policy/source snapshots are included in owner backup. Schema-only migrations do not rewrite old trips or issued financial history.

The owner API has authentication, billing, same-origin, tenant and support boundaries plus request limits. Settings and planning preserve unfinished selections across refresh; stale defaults require explicit review before saving or starting. Serialized trip creation checks the current source revision in its transaction. Original creation retries resolve the saved selection before reading newer defaults; historical legacy payload shapes retain their replay semantics.

Release 40 completed matching-source hosted desktop/phone baseline and focused policy/file-closure checks, after 144 automated tests and TypeScript checks. Exact production/stage versions, fingerprints and limits are in PROGRESS.md. No broader physical-stage gates or delegated file access were released. The earlier foundation-only descriptions have been consolidated here to avoid reporting delivered capabilities as pending.

The next local design and domain checklist are described in [TRIP-STAGE-EVIDENCE.md](TRIP-STAGE-EVIDENCE.md). Placement/loading/arrival remain unpublished: no new database table, API, UI or transition uses that local groundwork. Preserve old workflows until the complete opt-in contract and staging validation are ready.

27 October verification: tests/trip-evidence-boundary.test.ts crosses the operational timeline and required-file trip flows. Manually setting a consignment Complete does not dispatch/deliver/accept its trip evidence. An optional timeline POD cannot be accepted as the required private trip file, even when its bytes match. Uploading the correctly scoped private copy still requires explicit owner review before closing. Issued invoice snapshots, recognized profit and receipt/payment counts remain unchanged. This adds test coverage only, not a new publication or broader file access.

Schema-only migration 0017 adds trip_documents and trip_document_reviews plus tenant/reference/immutable guards. No historical customer data is seeded or rewritten. Uploads increment trip version without inventing a physical milestone. Accounting recognition, prices, issued invoice snapshots, supplier costs and payments are unchanged.

Next: extend evidence policies beyond the released workspace POD default to explicit placement/loading/arrival stages, with server-side requirements, stale-transition rejection, old-trip compatibility, partial delivery and reasoned exceptions. Existing manual history must not silently become invalid. Shipper access and cross-company evidence sharing are not enabled by this increment.
