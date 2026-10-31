CREATE TABLE `consignment_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`consignment_id` text NOT NULL,
	`kind` text NOT NULL,
	`stage` text,
	`details` text DEFAULT '{}' NOT NULL,
	`event_at` text,
	`recorded_at` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consignment_id`) REFERENCES `consignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `consignment_activity_scope` ON `consignment_activity` (`org_id`,`consignment_id`);--> statement-breakpoint
CREATE TABLE `consignment_files` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`consignment_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`category` text NOT NULL,
	`remark` text DEFAULT '' NOT NULL,
	`sha256` text NOT NULL,
	`bytes` integer NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consignment_id`) REFERENCES `consignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `entity_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_key` text NOT NULL,
	`profile` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entity_profile_identity` ON `entity_profiles` (`org_id`,`kind`,`entity_key`);--> statement-breakpoint
CREATE TABLE `supplier_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`supplier_key` text NOT NULL,
	`stars` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`actor` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_rating_identity` ON `supplier_ratings` (`org_id`,`supplier_key`);--> statement-breakpoint
CREATE TABLE `support_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`actor` text NOT NULL,
	`org_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`ended_at` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_sessions_token_hash_unique` ON `support_sessions` (`token_hash`);--> statement-breakpoint
ALTER TABLE `consignments` ADD `stage_status` text;--> statement-breakpoint
ALTER TABLE `consignments` ADD `stage_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DROP TRIGGER individual_membership_insert;
--> statement-breakpoint
DROP TRIGGER individual_membership_update;
--> statement-breakpoint
DROP TRIGGER individual_account_insert;
--> statement-breakpoint
DROP TRIGGER individual_account_enable;
--> statement-breakpoint
CREATE TRIGGER individual_membership_insert BEFORE INSERT ON memberships WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.org_id=NEW.org_id AND (CASE WHEN s.exempt=1 AND (s.exempt_until IS NULL OR julianday(s.exempt_until)>julianday('now')) AND s.exempt_tier IS NOT NULL THEN s.exempt_tier WHEN julianday(s.paid_until)>julianday('now') THEN s.plan_tier ELSE NULL END)='individual') AND EXISTS(SELECT 1 FROM password_accounts a WHERE a.user_id=NEW.user_id AND a.disabled=0) AND (SELECT COUNT(*) FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=NEW.org_id AND m.user_id<>NEW.user_id)>=1
BEGIN SELECT RAISE(ABORT,'Individual supports one active login. Choose Team to add accounts.'); END;
--> statement-breakpoint
CREATE TRIGGER individual_membership_update BEFORE UPDATE OF org_id,user_id ON memberships WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.org_id=NEW.org_id AND (CASE WHEN s.exempt=1 AND (s.exempt_until IS NULL OR julianday(s.exempt_until)>julianday('now')) AND s.exempt_tier IS NOT NULL THEN s.exempt_tier WHEN julianday(s.paid_until)>julianday('now') THEN s.plan_tier ELSE NULL END)='individual') AND EXISTS(SELECT 1 FROM password_accounts a WHERE a.user_id=NEW.user_id AND a.disabled=0) AND (SELECT COUNT(*) FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=NEW.org_id AND m.user_id<>NEW.user_id)>=1
BEGIN SELECT RAISE(ABORT,'Individual supports one active login. Choose Team to add accounts.'); END;
--> statement-breakpoint
CREATE TRIGGER individual_account_insert BEFORE INSERT ON password_accounts WHEN NEW.disabled=0 AND EXISTS(SELECT 1 FROM memberships own JOIN subscriptions s ON s.org_id=own.org_id WHERE own.user_id=NEW.user_id AND (CASE WHEN s.exempt=1 AND (s.exempt_until IS NULL OR julianday(s.exempt_until)>julianday('now')) AND s.exempt_tier IS NOT NULL THEN s.exempt_tier WHEN julianday(s.paid_until)>julianday('now') THEN s.plan_tier ELSE NULL END)='individual' AND EXISTS(SELECT 1 FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=own.org_id AND m.user_id<>NEW.user_id))
BEGIN SELECT RAISE(ABORT,'Individual supports one active login. Choose Team to add accounts.'); END;
--> statement-breakpoint
CREATE TRIGGER individual_account_enable BEFORE UPDATE OF disabled,user_id ON password_accounts WHEN NEW.disabled=0 AND EXISTS(SELECT 1 FROM memberships own JOIN subscriptions s ON s.org_id=own.org_id WHERE own.user_id=NEW.user_id AND (CASE WHEN s.exempt=1 AND (s.exempt_until IS NULL OR julianday(s.exempt_until)>julianday('now')) AND s.exempt_tier IS NOT NULL THEN s.exempt_tier WHEN julianday(s.paid_until)>julianday('now') THEN s.plan_tier ELSE NULL END)='individual' AND EXISTS(SELECT 1 FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=own.org_id AND m.user_id<>NEW.user_id))
BEGIN SELECT RAISE(ABORT,'Individual supports one active login. Choose Team to add accounts.'); END;
--> statement-breakpoint
CREATE INDEX consignment_file_scope ON consignment_files(org_id,consignment_id);
--> statement-breakpoint
CREATE TRIGGER consignment_stage_insert BEFORE INSERT ON consignments WHEN NEW.stage_status IS NOT NULL AND NEW.stage_status NOT IN('initiated','in_progress','complete')
BEGIN SELECT RAISE(ABORT,'Invalid consignment status.'); END;
--> statement-breakpoint
CREATE TRIGGER consignment_stage_update BEFORE UPDATE OF stage_status ON consignments WHEN NEW.stage_status IS NOT NULL AND NEW.stage_status NOT IN('initiated','in_progress','complete')
BEGIN SELECT RAISE(ABORT,'Invalid consignment status.'); END;
--> statement-breakpoint
CREATE TRIGGER consignment_activity_scope BEFORE INSERT ON consignment_activity WHEN NOT EXISTS(SELECT 1 FROM consignments c WHERE c.id=NEW.consignment_id AND c.org_id=NEW.org_id)
BEGIN SELECT RAISE(ABORT,'Consignment activity is outside this workspace.'); END;
--> statement-breakpoint
CREATE TRIGGER consignment_file_scope_guard BEFORE INSERT ON consignment_files WHEN NOT EXISTS(SELECT 1 FROM consignments c JOIN assets a ON a.org_id=c.org_id JOIN asset_scopes p ON p.asset_id=a.id AND p.org_id=a.org_id WHERE c.id=NEW.consignment_id AND c.org_id=NEW.org_id AND a.id=NEW.asset_id AND p.purpose='consignment_document')
BEGIN SELECT RAISE(ABORT,'Consignment document is outside this workspace.'); END;
--> statement-breakpoint
CREATE TRIGGER consignment_activity_immutable BEFORE UPDATE ON consignment_activity
BEGIN SELECT RAISE(ABORT,'Consignment activity is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER consignment_file_immutable BEFORE UPDATE ON consignment_files
BEGIN SELECT RAISE(ABORT,'Consignment files are immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER supplier_rating_insert BEFORE INSERT ON supplier_ratings WHEN typeof(NEW.stars)<>'integer' OR NEW.stars NOT BETWEEN 1 AND 5
BEGIN SELECT RAISE(ABORT,'Choose 1–5 stars.'); END;
--> statement-breakpoint
CREATE TRIGGER supplier_rating_update BEFORE UPDATE OF stars ON supplier_ratings WHEN typeof(NEW.stars)<>'integer' OR NEW.stars NOT BETWEEN 1 AND 5
BEGIN SELECT RAISE(ABORT,'Choose 1–5 stars.'); END;
--> statement-breakpoint
CREATE TRIGGER support_session_immutable BEFORE UPDATE OF id,token_hash,actor,org_id,reason,created_at,expires_at ON support_sessions
BEGIN SELECT RAISE(ABORT,'Support session scope is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER individual_subscription_override BEFORE UPDATE ON subscriptions WHEN
 (CASE WHEN NEW.exempt=1 AND (NEW.exempt_until IS NULL OR julianday(NEW.exempt_until)>julianday('now')) AND NEW.exempt_tier IS NOT NULL THEN NEW.exempt_tier WHEN julianday(NEW.paid_until)>julianday('now') THEN NEW.plan_tier ELSE NULL END)='individual'
 AND (SELECT COUNT(*) FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=NEW.org_id)>1
BEGIN SELECT RAISE(ABORT,'Individual supports one active login. Choose Team for this business.'); END;
