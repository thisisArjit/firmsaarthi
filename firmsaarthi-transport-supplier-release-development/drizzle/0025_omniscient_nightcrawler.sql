CREATE TABLE `company_websites` (
	`org_id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`draft` text NOT NULL,
	`published` text,
	`published_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_websites_slug_unique` ON `company_websites` (`slug`);