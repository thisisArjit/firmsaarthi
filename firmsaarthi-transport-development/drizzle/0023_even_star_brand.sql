ALTER TABLE `subscriptions` ADD `exempt_tier` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `exempt_interval` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `exempt_started_at` text;
--> statement-breakpoint
DROP TRIGGER subscription_trial_immutable;
--> statement-breakpoint
CREATE TRIGGER subscription_trial_immutable BEFORE UPDATE OF org_id,trial_started_at ON subscriptions
BEGIN SELECT RAISE(ABORT,'Subscription trial identity is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER subscription_trial_extension_only BEFORE UPDATE OF trial_ends_at ON subscriptions
WHEN julianday(NEW.trial_ends_at) IS NULL OR julianday(NEW.trial_ends_at)<julianday(OLD.trial_ends_at)
BEGIN SELECT RAISE(ABORT,'Trial end may only be extended.'); END;
--> statement-breakpoint
CREATE TRIGGER complimentary_plan_insert BEFORE INSERT ON subscriptions WHEN
  (NEW.exempt_tier IS NOT NULL OR NEW.exempt_interval IS NOT NULL OR NEW.exempt_started_at IS NOT NULL) AND
  NOT (NEW.exempt=1 AND NEW.exempt_tier IN ('team','individual') AND NEW.exempt_interval IN ('yearly','monthly') AND julianday(NEW.exempt_started_at) IS NOT NULL AND julianday(NEW.exempt_until) IS NOT NULL AND julianday(NEW.exempt_until)>julianday(NEW.exempt_started_at))
BEGIN SELECT RAISE(ABORT,'Invalid complimentary plan.'); END;
--> statement-breakpoint
CREATE TRIGGER complimentary_plan_update BEFORE UPDATE ON subscriptions WHEN
  (NEW.exempt_tier IS NOT NULL OR NEW.exempt_interval IS NOT NULL OR NEW.exempt_started_at IS NOT NULL) AND
  NOT (NEW.exempt=1 AND NEW.exempt_tier IN ('team','individual') AND NEW.exempt_interval IN ('yearly','monthly') AND julianday(NEW.exempt_started_at) IS NOT NULL AND julianday(NEW.exempt_until) IS NOT NULL AND julianday(NEW.exempt_until)>julianday(NEW.exempt_started_at))
BEGIN SELECT RAISE(ABORT,'Invalid complimentary plan.'); END;
