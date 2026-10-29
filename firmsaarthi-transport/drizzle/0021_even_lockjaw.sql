ALTER TABLE `trips` ADD `pod_policy` text DEFAULT 'reference_v1' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER trip_pod_policy_valid BEFORE INSERT ON trips
WHEN NEW.pod_policy NOT IN ('reference_v1','file_v1')
BEGIN SELECT RAISE(ABORT,'Choose a supported POD policy.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_pod_policy_immutable BEFORE UPDATE OF pod_policy ON trips
BEGIN SELECT RAISE(ABORT,'Trip POD policy is immutable. Existing trips keep their recorded requirements.'); END;
