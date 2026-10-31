CREATE TABLE `site_identity_links` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`subject` text NOT NULL,
	`expires_at` text NOT NULL
);
