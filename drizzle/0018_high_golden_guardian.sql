CREATE TABLE `billing_policy` (
	`id` text PRIMARY KEY NOT NULL,
	`trial_days` integer NOT NULL,
	`monthly_amount` integer NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscription_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`amount` integer NOT NULL,
	`reference` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_payment_reference` ON `subscription_grants` (`org_id`,`reference`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`org_id` text PRIMARY KEY NOT NULL,
	`trial_started_at` text NOT NULL,
	`trial_ends_at` text NOT NULL,
	`paid_until` text,
	`exempt` integer DEFAULT 0 NOT NULL,
	`exempt_until` text,
	`exemption_reason` text DEFAULT '' NOT NULL,
	`requested_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TRIGGER subscription_trial_immutable BEFORE UPDATE OF org_id,trial_started_at,trial_ends_at ON subscriptions
BEGIN SELECT RAISE(ABORT,'Subscription trial identity is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER subscription_grant_immutable BEFORE UPDATE ON subscription_grants
BEGIN SELECT RAISE(ABORT,'Subscription payment confirmations are immutable.'); END;
