CREATE TABLE `google_flows` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`nonce` text NOT NULL,
	`verifier` text NOT NULL,
	`intent` text NOT NULL,
	`user_id` text,
	`credential_version` text,
	`business_name` text DEFAULT '' NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_identities` (
	`subject` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `password_accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_identity_user` ON `google_identities` (`user_id`);