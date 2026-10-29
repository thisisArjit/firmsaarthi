CREATE TABLE `finance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`year` text NOT NULL,
	`date` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`counterparty` text DEFAULT '' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`amount` integer NOT NULL,
	`recoverable_tax` integer DEFAULT 0 NOT NULL,
	`paid_amount` integer DEFAULT 0 NOT NULL,
	`consignment_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consignment_id`) REFERENCES `consignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_external_source` ON `finance_entries` (`org_id`,`source`,`external_id`);