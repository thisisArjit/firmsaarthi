CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`gst` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_org_name` ON `companies` (`org_id`,`name`);--> statement-breakpoint
CREATE TABLE `consignments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`year` text NOT NULL,
	`cn` text NOT NULL,
	`date` text NOT NULL,
	`company` text NOT NULL,
	`truck` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`rate` integer DEFAULT 0 NOT NULL,
	`weight` text DEFAULT '0' NOT NULL,
	`freight` integer NOT NULL,
	`advance` integer DEFAULT 0 NOT NULL,
	`method` text DEFAULT 'Billed' NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`truck_freight` integer DEFAULT 0 NOT NULL,
	`other_charges` integer DEFAULT 0 NOT NULL,
	`advance_paid` integer DEFAULT 0 NOT NULL,
	`balance_paid` integer DEFAULT 0 NOT NULL,
	`advance_date` text DEFAULT '' NOT NULL,
	`balance_date` text DEFAULT '' NOT NULL,
	`payment_done` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consignments_org_year_cn` ON `consignments` (`org_id`,`year`,`cn`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_org_email` ON `invitations` (`org_id`,`email`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`invoice_id` text NOT NULL,
	`consignment_id` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`consignment_id`) REFERENCES `consignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_items_consignment` ON `invoice_items` (`consignment_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`year` text NOT NULL,
	`number` integer NOT NULL,
	`date` text NOT NULL,
	`company` text NOT NULL,
	`total` integer NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`snapshot` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_org_year_number` ON `invoices` (`org_id`,`year`,`number`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`user_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`profile` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoice_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_revisions_number` ON `invoice_revisions` (`invoice_id`,`revision`);--> statement-breakpoint
CREATE TABLE `invoice_sequences` (
	`org_id` text NOT NULL,
	`year` text NOT NULL,
	`next` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sequences_org_year` ON `invoice_sequences` (`org_id`,`year`);