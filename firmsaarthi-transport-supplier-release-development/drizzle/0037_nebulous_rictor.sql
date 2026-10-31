CREATE TABLE `sites_bridge_google` (
	`state` text PRIMARY KEY NOT NULL,
	`ticket_hash` text NOT NULL,
	`site_state` text NOT NULL,
	`nonce` text NOT NULL,
	`verifier` text NOT NULL,
	`phase` text NOT NULL,
	`browser_hash` text,
	`result_hash` text,
	`subject` text,
	`email` text,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_bridge_google_ticket_hash_unique` ON `sites_bridge_google` (`ticket_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_bridge_google_result_hash_unique` ON `sites_bridge_google` (`result_hash`);--> statement-breakpoint
CREATE TABLE `sites_bridge_nonces` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites_bridge_orders` (
	`receipt` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`provider_id` text,
	`payment_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_bridge_orders_provider_id_unique` ON `sites_bridge_orders` (`provider_id`);