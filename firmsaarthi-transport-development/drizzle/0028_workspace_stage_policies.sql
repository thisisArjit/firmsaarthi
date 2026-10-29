CREATE TABLE `workspace_stage_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`version` integer NOT NULL,
	`contract_version` integer NOT NULL,
	`placement_rule` text NOT NULL,
	`loading_rule` text NOT NULL,
	`arrival_rule` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "workspace_stage_policy_revision" CHECK(typeof("workspace_stage_policies"."version")='integer' AND "workspace_stage_policies"."version">0 AND "workspace_stage_policies"."version"<=9007199254740991),
	CONSTRAINT "workspace_stage_policy_contract" CHECK(typeof("workspace_stage_policies"."contract_version")='integer' AND "workspace_stage_policies"."contract_version"=1),
	CONSTRAINT "workspace_stage_policy_placement" CHECK("workspace_stage_policies"."placement_rule" IN ('optional','accepted_file')),
	CONSTRAINT "workspace_stage_policy_loading" CHECK("workspace_stage_policies"."loading_rule" IN ('optional','accepted_file')),
	CONSTRAINT "workspace_stage_policy_arrival" CHECK("workspace_stage_policies"."arrival_rule" IN ('optional','accepted_file'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_stage_policy_version` ON `workspace_stage_policies` (`org_id`,`version`);
--> statement-breakpoint
CREATE TRIGGER workspace_stage_policy_owner BEFORE INSERT ON workspace_stage_policies
WHEN NOT EXISTS (SELECT 1 FROM memberships WHERE org_id=NEW.org_id AND user_id=NEW.actor AND role='OWNER')
BEGIN SELECT RAISE(ABORT, 'Only a workspace owner can save stage evidence policy.'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_stage_policy_sequence BEFORE INSERT ON workspace_stage_policies
WHEN NEW.version <> COALESCE((SELECT MAX(version) FROM workspace_stage_policies WHERE org_id=NEW.org_id),0)+1
BEGIN SELECT RAISE(ABORT, 'Stage evidence policy revisions must be sequential.'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_stage_policy_no_update BEFORE UPDATE ON workspace_stage_policies
BEGIN SELECT RAISE(ABORT, 'Stage evidence policy history is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_stage_policy_no_delete BEFORE DELETE ON workspace_stage_policies
BEGIN SELECT RAISE(ABORT, 'Stage evidence policy history is immutable.'); END;
