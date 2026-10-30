CREATE TABLE `account_email_proofs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`credential_version` text NOT NULL,
	`method` text NOT NULL,
	`verified_at` text NOT NULL,
	`request_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `password_accounts`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_email_proof_method" CHECK("account_email_proofs"."method"='signup_email_otp')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_email_proofs_request_id_unique` ON `account_email_proofs` (`request_id`);--> statement-breakpoint
CREATE TABLE `google_account_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`subject` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`role` text NOT NULL,
	`credential_version` text NOT NULL,
	`reset_id` text,
	`new_credential_version` text,
	`completion_digest` text,
	`completion_nonce` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `password_accounts`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "google_claim_status" CHECK("google_account_claims"."status" IN ('pending','consumed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `google_claim_expiry` ON `google_account_claims` (`expires_at`);--> statement-breakpoint
CREATE TABLE `signup_email_proofs` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_hash` text NOT NULL,
	`email` text NOT NULL,
	`browser_hash` text NOT NULL,
	`code_hash` text NOT NULL,
	`business_kind` text DEFAULT 'transporter' NOT NULL,
	`registration_hash` text,
	`completion_digest` text,
	`completion_nonce` text,
	`user_id` text,
	`org_id` text,
	`credential_version` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "signup_email_status" CHECK("signup_email_proofs"."status" IN ('pending','sent','failed','verified','consumed')),
	CONSTRAINT "signup_email_attempts" CHECK("signup_email_proofs"."attempts">=0 AND "signup_email_proofs"."attempts"<=5),
	CONSTRAINT "signup_email_kind" CHECK("signup_email_proofs"."business_kind" IN ('transporter','supplier'))
);
--> statement-breakpoint
CREATE INDEX `signup_email_subject_time` ON `signup_email_proofs` (`subject_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `signup_email_expiry` ON `signup_email_proofs` (`expires_at`);