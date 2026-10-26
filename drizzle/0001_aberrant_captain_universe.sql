CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`source` text NOT NULL,
	`sha256` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP INDEX `companies_org_name`;--> statement-breakpoint
ALTER TABLE `companies` ADD `legacy_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `companies_legacy_source` ON `companies` (`org_id`,`legacy_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_org_name` ON `companies` (`org_id`,`name`) WHERE "companies"."legacy_key" IS NULL;--> statement-breakpoint
DROP INDEX `consignments_org_year_cn`;--> statement-breakpoint
ALTER TABLE `consignments` ADD `legacy_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `consignments_legacy_source` ON `consignments` (`org_id`,`legacy_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `consignments_org_year_cn` ON `consignments` (`org_id`,`year`,`cn`) WHERE "consignments"."legacy_key" IS NULL;