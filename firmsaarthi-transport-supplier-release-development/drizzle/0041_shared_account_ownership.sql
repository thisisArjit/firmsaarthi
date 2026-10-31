CREATE TABLE `shared_account_email_proofs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`credential_version` text NOT NULL,
	`method` text NOT NULL,
	`verified_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `password_accounts`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shared_account_email_method" CHECK("shared_account_email_proofs"."method" IN ('signup_email_otp','reset_email_otp','google_claim_email_otp'))
);
