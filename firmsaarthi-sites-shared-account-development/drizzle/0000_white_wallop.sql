CREATE TABLE `site_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`object_key` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `site_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `site_email_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `site_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `site_google_flows` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`nonce` text NOT NULL,
	`verifier` text NOT NULL,
	`expires_at` text NOT NULL,
	`link_user` text
);
--> statement-breakpoint
CREATE TABLE `site_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`provider_id` text,
	`payment_id` text,
	`status` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text NOT NULL,
	`paid_at` text,
	FOREIGN KEY (`request_id`) REFERENCES `site_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_orders_provider_id_unique` ON `site_orders` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_orders_payment_id_unique` ON `site_orders` (`payment_id`);--> statement-breakpoint
CREATE TABLE `site_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`request_id`) REFERENCES `site_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `site_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`business` text NOT NULL,
	`email` text NOT NULL,
	`slug` text NOT NULL,
	`domain_type` text NOT NULL,
	`brief` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`trial_ends_at` text,
	`paid_until` text,
	`admin_note` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`owner_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_slug_unique` ON `site_requests` (`slug`);--> statement-breakpoint
CREATE TABLE `site_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `site_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `site_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text,
	`google_subject` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_users_email_unique` ON `site_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_users_google_subject_unique` ON `site_users` (`google_subject`);