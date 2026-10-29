# Accounts summaries — 28 October 2026

Private staging candidate only. Consignments (including search) and Billing lists no longer show aggregate summary cards/toolbar amounts. Accounts has separate Consignment summary and Invoice summary tabs, owner-only like existing Accounts reports.

Company dropdown, financial year, inclusive date range, customer payment, payment terms, stage, record number, truck, source, destination and supplier filters control both tables and CSV/Excel/PDF exports. Consignments additionally support invoiced/not invoiced. Company totals and matching records use sortable, two-axis scrollable tables. More filters and matching details start collapsed.

Consignment freight less advances is explicitly separate from invoice receivables. Operational invoice filters must match one linked consignment; a whole invoice is counted once, never prorated. Excess receipts do not offset other invoices. Reads use tenant-scoped transactional queries without receipt backfills or invoice/snapshot mutations. Exports cap at 10,000 records with an explicit narrowing request. CSV formula injection is escaped; Excel retains numeric amounts and text identifiers. PDF wraps long rows across pages; its current standard font supports Latin text, and other scripts are replaced with question marks. CSV/Excel retain Unicode. Regional-script PDF fonts remain unfinished.

## Exact hosted candidate

- Staging project: appgprj_6ae065554e2c819195306c14a182519e, existing private audience and isolated resources, runtime19.
- Source: f129a261b668fde683cc29629aed62feb908103d.
- Fingerprint: 1c42a708598353e97340b92ffd7b07d71c84fa2e2b56918e0fd828d52f040cea.
- Version22: appgprj_6ae065554e2c819195306c14a182519e~appgver_5038213c00f881919fda45fd42728549.
- Successful deployment: appgdep_6ae1daca46a88191909a9c56d4c1800b, 2026-10-28T11:22:09.336005Z.

## Actual verification

TypeScript and focused 5/5 service/API/export tests passed on final source. Full suite before the final two small metadata/button fixes: 200 passed, one pre-existing deliberate production-fixture skip, no failures. Those two fixes were rechecked with TypeScript, focused tests and final build. Mirrored feature-only patch applies cleanly to tms-web and tms-google-release; both also pass TypeScript and 5/5 focused tests. Release-info is intentionally not mirrored because their surrounding candidate sources differ.

Final hosted fingerprint confirmed. Synthetic existing desktop workspace only: two consignments INR2,000 total; not-invoiced + Billed filters return one INR1,000 consignment. Pending/part-paid invoice is INR1,050, received INR300, remaining INR750. Desktop Consignments and Billing visibly have no top summaries. Both Accounts tabs load; company/payment/terms/invoicing filters verified, sort control exercised. Phone390x844 shows both reports without document overflow (375px document width), To Pay yields zero, native committed future date2026-11-29 yields zero, clear restores two. CUA date fill alone did not commit React input; native ArrowUp did. Do not report the uncommitted fill as a passing date check.

Actual browser downloads on final source: desktop filtered CSV and Excel, phone PDF. Final hosted HTTP Excel and filtered PDF also return200/no-store; anonymous report401. Local generated PDF rendered and visually checked across long-cell pages; workbook independently opened. Financial management report remains revenue/net profit200000 paise after report/download QA. No business writes or financial changes. Screenshots and focused evidence are ignored outputs/account-summary-*.

## Resume / release boundary

Production remains version43. No production save, packaging or publish performed. Full five-scenario hosted desktop/phone baseline and prior user-performed email-reset completion remain required on the same final source. Focused summary checks are not the full gate; do not turn them into passing staging-validation.json or invent a production release note. Complete baseline first, resolve the PDF non-Latin limitation before advertising regional-script PDF support, then generate matching fingerprints and follow STAGING.md. Original Apps Script and unrelated trip/provider/accounting work preserved.

