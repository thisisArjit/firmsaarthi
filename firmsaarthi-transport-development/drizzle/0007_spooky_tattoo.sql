ALTER TABLE `invoice_receipts` ADD `void_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER protect_receipted_invoice_total BEFORE UPDATE OF total ON invoices
WHEN NEW.total<>OLD.total AND EXISTS(SELECT 1 FROM invoice_receipts WHERE invoice_id=OLD.id AND org_id=OLD.org_id AND status='posted')
BEGIN SELECT RAISE(ABORT,'Void recorded receipts before changing invoice total.'); END;
--> statement-breakpoint
CREATE TRIGGER protect_invoice_receipt_history BEFORE DELETE ON invoices
WHEN EXISTS(SELECT 1 FROM invoice_receipts WHERE invoice_id=OLD.id AND org_id=OLD.org_id AND source='manual')
BEGIN SELECT RAISE(ABORT,'Invoices with recorded receipt history cannot be deleted.'); END;
