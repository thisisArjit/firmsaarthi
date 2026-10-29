CREATE TABLE `transport_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`vehicle` text NOT NULL,
	`observed_at` text NOT NULL,
	`received_at` text NOT NULL,
	`payload` text NOT NULL,
	`source_reference` text NOT NULL,
	`provenance` text DEFAULT 'imported' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transport_event_external` ON `transport_events` (`org_id`,`kind`,`provider`,`external_id`);