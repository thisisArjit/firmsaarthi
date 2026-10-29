CREATE TABLE `supplier_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`consignment_id` text NOT NULL,
	`provider_snapshot` text NOT NULL,
	`kind` text NOT NULL,
	`date` text,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`created_at` text NOT NULL,
	`voided_at` text,
	`void_reason` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consignment_id`) REFERENCES `consignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `supplier_payment_consignment` ON `supplier_payments` (`org_id`,`consignment_id`);--> statement-breakpoint
ALTER TABLE `consignments` ADD `provider_due_date` text;--> statement-breakpoint
ALTER TABLE `consignments` ADD `provider_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `consignments` ADD `settlement_initialized` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER supplier_payment_validate BEFORE INSERT ON supplier_payments
WHEN NEW.amount<=0 OR NEW.kind NOT IN ('advance','payment') OR NEW.status<>'posted'
OR NOT EXISTS(SELECT 1 FROM consignments c WHERE c.id=NEW.consignment_id AND c.org_id=NEW.org_id AND c.settlement_initialized=1)
OR (NEW.source='manual' AND (NEW.date IS NULL OR NOT EXISTS(SELECT 1 FROM consignments c WHERE c.id=NEW.consignment_id AND c.org_id=NEW.org_id AND c.provider<>'' AND c.provider=NEW.provider_snapshot AND NEW.amount<=c.truck_freight+c.other_charges-COALESCE((SELECT SUM(amount) FROM supplier_payments p WHERE p.consignment_id=c.id AND p.org_id=c.org_id AND p.status='posted'),0))))
BEGIN SELECT RAISE(ABORT,'Supplier payment exceeds the remaining cost or provider details changed.'); END;
--> statement-breakpoint
CREATE TRIGGER supplier_payment_immutable BEFORE UPDATE ON supplier_payments
WHEN NEW.id<>OLD.id OR NEW.org_id<>OLD.org_id OR NEW.consignment_id<>OLD.consignment_id OR NEW.provider_snapshot<>OLD.provider_snapshot OR NEW.kind<>OLD.kind OR NEW.date IS NOT OLD.date OR NEW.amount<>OLD.amount OR NEW.method<>OLD.method OR NEW.reference<>OLD.reference OR NEW.source<>OLD.source OR NEW.created_at<>OLD.created_at OR OLD.status<>'posted' OR NEW.status<>'void' OR length(trim(NEW.void_reason))=0
BEGIN SELECT RAISE(ABORT,'Supplier payment history is immutable; void an incorrect record with a reason.'); END;
--> statement-breakpoint
CREATE TRIGGER supplier_payment_insert_version AFTER INSERT ON supplier_payments
BEGIN UPDATE consignments SET provider_version=provider_version+1 WHERE id=NEW.consignment_id AND org_id=NEW.org_id; END;
--> statement-breakpoint
CREATE TRIGGER supplier_payment_void_version AFTER UPDATE OF status ON supplier_payments
BEGIN UPDATE consignments SET provider_version=provider_version+1 WHERE id=NEW.consignment_id AND org_id=NEW.org_id; END;
--> statement-breakpoint
CREATE TRIGGER supplier_cost_payment_guard BEFORE UPDATE OF truck_freight,other_charges,provider ON consignments
WHEN (NEW.truck_freight+NEW.other_charges<>OLD.truck_freight+OLD.other_charges AND NEW.truck_freight+NEW.other_charges<COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE consignment_id=OLD.id AND org_id=OLD.org_id AND status='posted'),0))
OR (OLD.provider<>'' AND NEW.provider<>OLD.provider AND EXISTS(SELECT 1 FROM supplier_payments WHERE consignment_id=OLD.id AND org_id=OLD.org_id AND status='posted'))
BEGIN SELECT RAISE(ABORT,'Reconcile recorded supplier payments before reducing cost or changing the provider.'); END;
--> statement-breakpoint
CREATE TRIGGER supplier_legacy_totals_locked BEFORE UPDATE OF advance_paid,balance_paid,advance_date,balance_date,payment_done,settlement_initialized ON consignments
WHEN OLD.settlement_initialized=1 AND (NEW.advance_paid<>OLD.advance_paid OR NEW.balance_paid<>OLD.balance_paid OR NEW.advance_date<>OLD.advance_date OR NEW.balance_date<>OLD.balance_date OR NEW.payment_done<>OLD.payment_done OR NEW.settlement_initialized<>1)
BEGIN SELECT RAISE(ABORT,'Use supplier settlement history to correct payment records.'); END;
