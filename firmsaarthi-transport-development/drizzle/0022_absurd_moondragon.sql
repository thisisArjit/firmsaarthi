CREATE TABLE `invoice_templates` (
	`org_id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `business_leads` ADD `phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `business_leads` ADD `email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `business_leads` ADD `contact_source_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `business_leads` ADD `contact_checked_on` text DEFAULT '' NOT NULL;