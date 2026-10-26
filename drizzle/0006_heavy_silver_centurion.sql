CREATE TABLE `invoice_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`date` text,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL,
	`voided_at` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
