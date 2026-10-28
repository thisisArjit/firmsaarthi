# Inventory review evidence — 28 October 2026

Official sources only; vendor capabilities are benchmarks, not copied assets or a promise of parity. Product/plan restrictions remain a separate check before relying on any hosted integration.

| Official evidence | User job / documented pattern | Decision / delivered gap |
| --- | --- | --- |
| [Zoho adjustments](https://www.zoho.com/us/inventory/help/items/inventory-adjustments.html) | Explain quantity discrepancies with adjustment reasons, distinct from ordinary receipts/issues | Reason required for every local movement; owner-only adjustment. Physical count documents and value adjustments are not delivered. |
| [Odoo19 counts](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html) | Review a count and retain the resulting stock movement/history | A balance version is required for local delta adjustments, so stale review cannot silently overwrite current stock. Count-to-target UI remains future. |
| [ERPNext immutable ledger](https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext) | Keep originals and explicit reversal records on cancellation | Local SQL prevents posted movement edits/deletes; one linked opposite reversal, no reversal-of-reversal; cannot reverse a consumed receipt into negative stock. No backdated valuation engine. |
| [ERPNext ledger](https://docs.frappe.io/erpnext/stock-ledger) | Explain item/warehouse changes through source rows | Local item/warehouse history sums to stored quantity. Source-document navigation and hosted views remain to build. |
| [Zoho purchase receives](https://www.zoho.com/us/inventory/help/purchase-orders/purchase-receive.html) | Receive only what physically arrives and retain the order/receipt distinction | I2 will link partial receipts to order lines, show ordered/received/remaining and preserve returns. Purchase order creation itself must not increase stock. Not implemented. |
| [Odoo19 one-step receipt](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/receipts_delivery_one_step.html) | Keep a basic warehouse receiving workflow simple before optional multistep routes | Start single warehouse per movement with explicit receive/issue; avoid automatic quality/transit shells. Transfers and quality inspection remain future. |

Engineering decisions are ours: exact bounded integer quantities, immutable unit, default no negatives, scoped request IDs with conflicting-reuse denial, in-transaction role check and database guards, explicit adjustment version.9 local tests passed including two independent connections racing7-unit issues against10 units: exactly one succeeded, balance3. This is not evidence of vendor behavior or hosted D1 concurrency.

Adjacent review focus this cycle: purchasing, because its receipt/stock boundary is the next dependency. CRM/service/staff have not been started as new apps. Continue stock I1 through authentication/UI/hosted acceptance before I2 implementation or another product.
