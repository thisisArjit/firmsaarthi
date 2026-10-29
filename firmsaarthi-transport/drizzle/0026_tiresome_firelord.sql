CREATE TABLE `workspace_pod_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`version` integer NOT NULL,
	`pod_mode` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "workspace_pod_policy_mode" CHECK("workspace_pod_policies"."pod_mode" IN ('reference_v1','file_v1')),
	CONSTRAINT "workspace_pod_policy_positive_version" CHECK(typeof("workspace_pod_policies"."version")='integer' AND "workspace_pod_policies"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_pod_policy_version` ON `workspace_pod_policies` (`org_id`,`version`);
--> statement-breakpoint
CREATE TRIGGER workspace_pod_policy_no_update BEFORE UPDATE ON workspace_pod_policies BEGIN SELECT RAISE(ABORT, 'Evidence policy history is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_pod_policy_no_delete BEFORE DELETE ON workspace_pod_policies BEGIN SELECT RAISE(ABORT, 'Evidence policy history is immutable.'); END;
