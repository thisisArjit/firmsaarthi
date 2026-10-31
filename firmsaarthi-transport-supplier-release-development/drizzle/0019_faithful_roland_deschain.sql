ALTER TABLE `billing_policy` ADD `yearly_amount` integer DEFAULT 1999900 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_grants` ADD `interval` text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `requested_interval` text DEFAULT 'monthly' NOT NULL;