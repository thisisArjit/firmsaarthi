# Working rules for FirmSaarthi Inventory

Read README.md, docs/PROGRESS.md and docs/ROADMAP.md before changes. Preserve other products and original Apps Script source. This is the sole new product under construction; do not create additional empty product apps.

No public release from local tests. Required: supported Sites runtime adapter, product-specific authenticated identity and membership, isolated private staging, same-source desktop/phone hosted E2E including stock invariants, permissions, concurrent/duplicate writes and error recovery. Record literal returned deployment/version IDs and checks. Do not copy Transport/customer data or credentials, grant access by matching email, create paid services, change existing DNS/mail/OAuth or advertise this offering before it is usable and published.

Keep stock quantity separate from money/valuation. Posted ledger immutable, reversals explicit and reasoned, base units immutable, no negatives or silent backdating. Review replay/concurrency/tenant boundaries after changes. Plaintext credentials, database files and customer documents never go in Git. Bootstrap and actor parameters in the reference engine are internal provisioning, not public auth.
