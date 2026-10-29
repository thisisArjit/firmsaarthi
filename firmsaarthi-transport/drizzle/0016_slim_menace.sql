CREATE TABLE `business_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`industry` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'research' NOT NULL,
	`company_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_lead_name_city` ON `business_leads` (`org_id`,`name`,`city`);