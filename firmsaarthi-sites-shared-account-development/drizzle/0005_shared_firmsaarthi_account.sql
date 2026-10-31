CREATE TABLE `site_account_flows` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_account_reviews` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`principal` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_federated_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`credential_version` text NOT NULL,
	`source_session_hash` text,
	FOREIGN KEY (`user_id`) REFERENCES `site_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `site_firmsaarthi_links` (
	`transport_user_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`credential_version` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `site_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_firmsaarthi_links_user_id_unique` ON `site_firmsaarthi_links` (`user_id`);