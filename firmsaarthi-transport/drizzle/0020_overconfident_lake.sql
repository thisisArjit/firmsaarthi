ALTER TABLE `billing_policy` ADD `team_monthly_amount` integer DEFAULT 349900 NOT NULL;--> statement-breakpoint
ALTER TABLE `billing_policy` ADD `team_yearly_amount` integer DEFAULT 2999900 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_grants` ADD `tier` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `plan_tier` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `requested_tier` text DEFAULT 'individual' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER individual_membership_insert BEFORE INSERT ON memberships WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.org_id=NEW.org_id AND s.plan_tier='individual' AND julianday(s.paid_until)>julianday('now')) AND EXISTS(SELECT 1 FROM password_accounts a WHERE a.user_id=NEW.user_id AND a.disabled=0) AND (SELECT COUNT(*) FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=NEW.org_id AND m.user_id<>NEW.user_id)>=1
BEGIN SELECT RAISE(ABORT,'Individual supports one active login. Choose Team to add accounts.'); END;
--> statement-breakpoint
CREATE TRIGGER individual_membership_update BEFORE UPDATE OF org_id,user_id ON memberships WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.org_id=NEW.org_id AND s.plan_tier='individual' AND julianday(s.paid_until)>julianday('now')) AND EXISTS(SELECT 1 FROM password_accounts a WHERE a.user_id=NEW.user_id AND a.disabled=0) AND (SELECT COUNT(*) FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=NEW.org_id AND m.user_id<>NEW.user_id)>=1
BEGIN SELECT RAISE(ABORT,'Individual supports one active login. Choose Team to add accounts.'); END;
--> statement-breakpoint
CREATE TRIGGER individual_account_insert BEFORE INSERT ON password_accounts WHEN NEW.disabled=0 AND EXISTS(SELECT 1 FROM memberships own JOIN subscriptions s ON s.org_id=own.org_id WHERE own.user_id=NEW.user_id AND s.plan_tier='individual' AND julianday(s.paid_until)>julianday('now') AND EXISTS(SELECT 1 FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=own.org_id AND m.user_id<>NEW.user_id))
BEGIN SELECT RAISE(ABORT,'Individual supports one active login. Choose Team to add accounts.'); END;
--> statement-breakpoint
CREATE TRIGGER individual_account_enable BEFORE UPDATE OF disabled,user_id ON password_accounts WHEN NEW.disabled=0 AND EXISTS(SELECT 1 FROM memberships own JOIN subscriptions s ON s.org_id=own.org_id WHERE own.user_id=NEW.user_id AND s.plan_tier='individual' AND julianday(s.paid_until)>julianday('now') AND EXISTS(SELECT 1 FROM memberships m JOIN password_accounts a ON a.user_id=m.user_id AND a.disabled=0 WHERE m.org_id=own.org_id AND m.user_id<>NEW.user_id))
BEGIN SELECT RAISE(ABORT,'Individual supports one active login. Choose Team to add accounts.'); END;
