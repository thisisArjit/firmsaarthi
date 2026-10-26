# Current transport-product patterns

Checked 26 October 2026 using public primary/vendor sources. These are vendor-described features, not an independent assessment of performance, pricing, verification quality or integration entitlement. No accounts were created, customer data submitted or external marketplace transactions performed.

## Demand, supply and trust

[Vahak's load marketplace](https://www.vahak.in/en/marketplace/load) offers route/lorry-type discovery and describes bidding/booking between shippers and transporters. Its page advertises KYC/GST verification. That does not mean Logistrace has verification access or should copy its claims. Product inference: a useful load post needs structured goods, locations, vehicle fit and rates; explicit publish/bid/award states and trustworthy participant access should precede an open marketplace.

[BlackBuck's products page](https://www.blackbuck.com/company-products.html) describes a load marketplace, communication between shippers and truck operators, and payment-dispute assistance alongside fleet services. The page includes dated usage statistics; do not repeat these as current market measurements. Product inference: matching alone is insufficient—identity boundaries, agreed terms, communication evidence and a dispute path are core workflows, not late cosmetic additions.

## Trip execution and evidence

Rechecked 26 October 2026 for required POD evidence: Fleetx's official vendor-collaboration page still describes vehicle placement/loading and electronic capture/storage of delivery confirmations as distinct workflows. Product inference for this bounded release: a saved per-trip rule can require an uploaded, explicitly accepted file, rather than equating a typed reference with file evidence. Owner review is not independent/provider verification. No vendor assets or performance claims are adopted.

[Fleetx India's vendor-collaboration page](https://www.fleetx.ai/vendor-collaboration) describes indenting, vehicle placement, loading and electronic proof of delivery. Product inference: placement, load readiness, movement and accepted evidence should be separate states, with clear responsibility and prerequisites. A private upload and a reviewed/accepted POD are different events. Record required evidence rules server-side rather than relying on a disabled UI button.

Use `fleetx.ai` for this India-focused reference. Similarly named `fleetx.com` material is not treated as evidence about the same vendor.

Rechecked 26 October 2026 for the POD increment: the official page still separates vehicle placement/loading from electronic delivery capture, and describes storing electronic delivery confirmations. Logistrace inference: capture and acceptance must remain separate, with immutable source evidence and explicit file-specific reviews. This release uses owner-only document access instead of inferring broad document entitlement from an operational login. No vendor performance, invoicing-speed or independent verification claim is adopted.

## Logistrace priorities inferred from the evidence and user request

1. Finish private document-backed trip execution and missing-evidence queues on the current operational model.
2. Introduce a separate shipper portal/capability boundary and structured load drafts in a private pilot.
3. Add private transporter proposals, explicit award and one-time booking handoff; keep private company ledgers isolated.
4. Establish consent, minimization, retention/review and dispute rules for KYC before broader marketplace activation.
5. Add ratings only when a real completed-platform relationship supports review eligibility and moderation.

These are product decisions, not statements that those features are already implemented. The living roadmap and release gates are in `../ROADMAP.md`. Revisit source pages when solving a new milestone; do not add unnecessary integrations, copy vendor assets, assume access to their APIs or manufacture demand, prices or ratings.
