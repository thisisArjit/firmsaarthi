CREATE TABLE `invoice_terms_history` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`due_date` text,
	`note` text NOT NULL,
	`version` integer NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_terms_version` ON `invoice_terms_history` (`org_id`,`invoice_id`,`version`);--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `party_org_code` ON `parties` (`org_id`,`code`);--> statement-breakpoint
CREATE TABLE `party_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`party_id` text NOT NULL,
	`kind` text NOT NULL,
	`alias` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `party_source_alias` ON `party_aliases` (`org_id`,`kind`,`alias`);--> statement-breakpoint
ALTER TABLE `consignments` ADD `supplier_party_id` text REFERENCES parties(id);--> statement-breakpoint
ALTER TABLE `invoices` ADD `customer_party_id` text REFERENCES parties(id);--> statement-breakpoint
ALTER TABLE `invoices` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `terms_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER party_alias_scope BEFORE INSERT ON party_aliases
WHEN NOT EXISTS(SELECT 1 FROM parties p WHERE p.id=NEW.party_id AND p.org_id=NEW.org_id AND p.kind=NEW.kind)
BEGIN SELECT RAISE(ABORT,'Party alias must belong to an account of the same company and type.'); END;
--> statement-breakpoint
CREATE TRIGGER party_alias_immutable BEFORE UPDATE ON party_aliases
BEGIN SELECT RAISE(ABORT,'Source-name links are immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_due_date_insert BEFORE INSERT ON invoices
WHEN NEW.due_date IS NOT NULL AND NEW.due_date<NEW.date
BEGIN SELECT RAISE(ABORT,'Agreed invoice due date cannot be before invoice date.'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_due_date_update BEFORE UPDATE OF due_date,date ON invoices
WHEN NEW.due_date IS NOT NULL AND NEW.due_date<NEW.date
BEGIN SELECT RAISE(ABORT,'Update agreed due terms before moving the invoice date past its due date.'); END;
