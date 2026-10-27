# Business-product review evidence

Initial review: 28 October 2026, Asia/Kolkata. This is the start of recurring research, not a claim of exhaustive competitive review or implementation. Sources are vendors' official documentation. Feature availability and plan restrictions must be rechecked before relying on an integration or pricing promise.

| Product / direct official source | Documented pattern | FirmSaarthi decision |
| --- | --- | --- |
| [Zoho Inventory feature list](https://www.zoho.com/us/inventory/kb/general-overview/zom-feature-list.html) | Item/groups, serial and batch tracking, reorder and purchasing/receiving workflows | Build accurate items/stock ledger first, then purchasing/partial receipt, then traceability and reorder planning. No serial/batch claims until implemented. |
| [Odoo Inventory features](https://www.odoo.com/app/inventory-features) | Warehouse barcode operations, replenishment and inventory valuation | Make warehouse/location movements clear; provide manual fallback for scanner workflows. Define costing before delivering valuation, not a number inferred from stock counts. |
| [ERPNext immutable ledger](https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext) | Retains original stock/accounting entries and uses reversing entries for cancellation; backdating affects valuation | Preserve posted history and use explicit reversals; define cancellation, stock chronology and backdating policy early. No silent overwrite of posted quantities. |
| [ERPNext stock ledger](https://docs.frappe.io/erpnext/stock-ledger) | Traceable stock movements with source-document navigation | Every stock balance should be explainable from item/warehouse movement history with links to its source action. |

## Initial gaps and next review

Inventory is a new planned product. No existing inventory app was implemented or hosted in this turn; all listed inventory capabilities remain gaps until verified in actual code and hosted workflows. First deep review: quantity precision/units, warehouses, receive/issue/adjustment/reversal, negative-stock policy, concurrent posting, tenant/role permissions, accessible phone UI and recovery. Assess small-business jobs and acceptance criteria, not feature-count parity.

Adjacent domains to research in later cycles: purchasing/procurement, sales/CRM, service/job work, expenses/accounts and staff. Record dated official source links and user-value decisions for each before opening a new product. Keep unavailable products out of the public offering list. Do not copy vendor branding, screenshots, proprietary copy or assets.
