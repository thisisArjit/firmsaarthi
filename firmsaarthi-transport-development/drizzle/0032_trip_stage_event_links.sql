CREATE TABLE `trip_stage_event_dependencies` (
	`event_id` text NOT NULL,
	`prerequisite_event_id` text NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `prerequisite_event_id`),
	FOREIGN KEY (`event_id`) REFERENCES `trip_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prerequisite_event_id`) REFERENCES `trip_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trip_stage_dependency_parent` ON `trip_stage_event_dependencies` (`org_id`,`trip_id`,`prerequisite_event_id`);--> statement-breakpoint
CREATE TABLE `trip_stage_evidence_uses` (
	`event_id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`review_id` text NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `trip_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `trip_stage_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`review_id`) REFERENCES `trip_stage_reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trip_stage_use_review` ON `trip_stage_evidence_uses` (`org_id`,`trip_id`,`review_id`);
--> statement-breakpoint
CREATE TRIGGER trip_stage_dependency_scope BEFORE INSERT ON trip_stage_event_dependencies
WHEN NOT EXISTS(SELECT 1 FROM trips t
 JOIN trip_events e ON e.id=NEW.event_id AND e.org_id=t.org_id AND e.trip_id=t.id
 JOIN trip_events p ON p.id=NEW.prerequisite_event_id AND p.org_id=e.org_id AND p.trip_id=e.trip_id
 JOIN memberships m ON m.org_id=e.org_id AND m.user_id=e.actor AND m.role IN ('OWNER','MEMBER','DISPATCHER')
 WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND t.version=e.version AND p.version<e.version AND p.event_at<=e.event_at AND p.recorded_at<=e.recorded_at
 AND (e.kind<>'correction' OR m.role='OWNER')
 AND ((e.kind IN ('loading','arrival','delivery') AND EXISTS(SELECT 1 FROM trip_allocations a WHERE a.id=e.allocation_id AND a.org_id=e.org_id AND a.trip_id=e.trip_id AND a.active=1)) OR (e.kind IN ('dispatch','correction') AND e.allocation_id IS NULL))
 AND json_extract(t.creation_payload,'$.stagePolicyRequest.contract')='workspace_stage_v1'
 AND json_extract(e.payload,'$.stageTransition.contract')='physical_stage_v1'
 AND EXISTS(SELECT 1 FROM json_each(e.payload,'$.stageTransition.prerequisiteEventIds') j WHERE j.type='text' AND j.value=p.id)
 AND ((e.kind='loading' AND p.kind='placement' AND p.allocation_id IS NULL)
 OR (e.kind='dispatch' AND ((p.kind='placement' AND p.allocation_id IS NULL) OR (p.kind='loading' AND EXISTS(SELECT 1 FROM trip_allocations a WHERE a.id=p.allocation_id AND a.org_id=e.org_id AND a.trip_id=e.trip_id AND a.active=1))))
 OR (e.kind='arrival' AND ((p.kind='dispatch' AND p.allocation_id IS NULL) OR (p.kind='loading' AND p.allocation_id=e.allocation_id)))
 OR (e.kind='delivery' AND ((p.kind='dispatch' AND p.allocation_id IS NULL) OR (p.kind='arrival' AND p.allocation_id=e.allocation_id)))
 OR (e.kind='correction' AND e.target_event_id=p.id AND p.kind IN ('placement','loading','arrival')))
 AND NOT EXISTS(SELECT 1 FROM trip_events c WHERE c.org_id=e.org_id AND c.trip_id=e.trip_id AND c.kind='correction' AND c.target_event_id=p.id AND c.id<>e.id)
 AND NOT EXISTS(SELECT 1 FROM trip_events c WHERE c.org_id=e.org_id AND c.trip_id=e.trip_id AND c.kind='correction' AND c.target_event_id=e.id))
BEGIN SELECT RAISE(ABORT,'Stage prerequisite link must match its current scoped event, original request and active history.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_use_scope BEFORE INSERT ON trip_stage_evidence_uses
WHEN NOT EXISTS(SELECT 1 FROM trips t
 JOIN trip_events e ON e.id=NEW.event_id AND e.org_id=t.org_id AND e.trip_id=t.id
 JOIN memberships m ON m.org_id=e.org_id AND m.user_id=e.actor AND m.role IN ('OWNER','MEMBER','DISPATCHER')
 JOIN trip_stage_documents d ON d.id=NEW.document_id AND d.org_id=e.org_id AND d.trip_id=e.trip_id AND d.stage=e.kind AND d.allocation_id IS e.allocation_id
 JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_stage'
 JOIN trip_stage_reviews r ON r.id=NEW.review_id AND r.org_id=d.org_id AND r.trip_id=d.trip_id AND r.document_id=d.id AND r.kind='accept' AND r.actor_role='OWNER'
 WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND t.version=e.version AND e.kind IN ('placement','loading','arrival')
 AND json_extract(t.creation_payload,'$.stagePolicyRequest.contract')='workspace_stage_v1'
 AND json_extract(t.creation_payload,'$.stagePolicySnapshot.policy.'||e.kind)='accepted_file'
 AND json_extract(e.payload,'$.stageTransition.contract')='physical_stage_v1'
 AND json_type(e.payload,'$.stageTransition.evidenceUses')='array' AND json_array_length(e.payload,'$.stageTransition.evidenceUses')=1
 AND json_extract(e.payload,'$.stageTransition.evidenceUses[0].documentId')=d.id
 AND json_extract(e.payload,'$.stageTransition.evidenceUses[0].reviewId')=r.id
 AND d.trip_version<r.trip_version AND r.trip_version<e.version AND r.recorded_at<=e.recorded_at
 AND (d.allocation_id IS NULL OR EXISTS(SELECT 1 FROM trip_allocations a WHERE a.id=d.allocation_id AND a.org_id=d.org_id AND a.trip_id=d.trip_id AND a.active=1))
 AND NOT EXISTS(SELECT 1 FROM trip_stage_reviews c WHERE c.org_id=r.org_id AND c.trip_id=r.trip_id AND c.kind='correction' AND c.target_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM trip_events c WHERE c.org_id=e.org_id AND c.trip_id=e.trip_id AND c.kind='correction' AND c.target_event_id=e.id))
BEGIN SELECT RAISE(ABORT,'Stage evidence use must retain its exact original private file and active owner acceptance.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_dependency_no_update BEFORE UPDATE ON trip_stage_event_dependencies
BEGIN SELECT RAISE(ABORT,'Stage dependency history is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_dependency_no_delete BEFORE DELETE ON trip_stage_event_dependencies
BEGIN SELECT RAISE(ABORT,'Stage dependency history is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_use_no_update BEFORE UPDATE ON trip_stage_evidence_uses
BEGIN SELECT RAISE(ABORT,'Stage evidence use history is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_use_no_delete BEFORE DELETE ON trip_stage_evidence_uses
BEGIN SELECT RAISE(ABORT,'Stage evidence use history is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_used_review_correction BEFORE INSERT ON trip_stage_reviews
WHEN NEW.kind='correction' AND EXISTS(SELECT 1 FROM trip_stage_evidence_uses u JOIN trip_events e ON e.id=u.event_id AND e.org_id=u.org_id AND e.trip_id=u.trip_id WHERE u.review_id=NEW.target_id AND u.org_id=NEW.org_id AND u.trip_id=NEW.trip_id AND NOT EXISTS(SELECT 1 FROM trip_events c WHERE c.org_id=e.org_id AND c.trip_id=e.trip_id AND c.kind='correction' AND c.target_event_id=e.id))
BEGIN SELECT RAISE(ABORT,'Reverse the stage using this accepted review before correcting it.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_dependent_event_correction BEFORE INSERT ON trip_events
WHEN NEW.kind='correction' AND EXISTS(SELECT 1 FROM trip_stage_event_dependencies d JOIN trip_events e ON e.id=d.event_id AND e.org_id=d.org_id AND e.trip_id=d.trip_id WHERE d.prerequisite_event_id=NEW.target_event_id AND d.org_id=NEW.org_id AND d.trip_id=NEW.trip_id AND e.kind<>'correction' AND NOT EXISTS(SELECT 1 FROM trip_events c WHERE c.org_id=e.org_id AND c.trip_id=e.trip_id AND c.kind='correction' AND c.target_event_id=e.id))
BEGIN SELECT RAISE(ABORT,'Reverse dependent events before correcting their prerequisite.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_linked_history_no_delete BEFORE DELETE ON trip_events
WHEN (json_valid(OLD.payload) AND json_extract(OLD.payload,'$.stageTransition.contract')='physical_stage_v1')
 OR (OLD.kind='correction' AND EXISTS(SELECT 1 FROM trip_events target WHERE target.id=OLD.target_event_id AND target.org_id=OLD.org_id AND target.trip_id=OLD.trip_id AND json_valid(target.payload) AND json_extract(target.payload,'$.stageTransition.contract')='physical_stage_v1'))
BEGIN SELECT RAISE(ABORT,'Physical stage history and its corrections must be retained.'); END;
