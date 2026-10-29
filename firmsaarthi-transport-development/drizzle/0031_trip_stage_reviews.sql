CREATE TABLE `trip_stage_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`document_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text,
	`trip_version` integer NOT NULL,
	`event_at` text NOT NULL,
	`note` text NOT NULL,
	`payload` text NOT NULL,
	`actor` text NOT NULL,
	`actor_role` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `trip_stage_documents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trip_stage_review_kind" CHECK("trip_stage_reviews"."kind" IN ('accept','reject','correction')),
	CONSTRAINT "trip_stage_review_role" CHECK("trip_stage_reviews"."actor_role"='OWNER'),
	CONSTRAINT "trip_stage_review_version_value" CHECK(typeof("trip_stage_reviews"."trip_version")='integer' AND "trip_stage_reviews"."trip_version">0 AND "trip_stage_reviews"."trip_version"<=9007199254740991),
	CONSTRAINT "trip_stage_review_target" CHECK(("trip_stage_reviews"."kind"='correction' AND "trip_stage_reviews"."target_id" IS NOT NULL) OR ("trip_stage_reviews"."kind"<>'correction' AND "trip_stage_reviews"."target_id" IS NULL)),
	CONSTRAINT "trip_stage_review_note" CHECK(length("trip_stage_reviews"."note")<=500 AND ("trip_stage_reviews"."kind"='accept' OR length(trim("trip_stage_reviews"."note"))>0)),
	CONSTRAINT "trip_stage_review_payload" CHECK(json_valid("trip_stage_reviews"."payload") AND json_type("trip_stage_reviews"."payload")='object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_stage_review_version` ON `trip_stage_reviews` (`org_id`,`trip_id`,`trip_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `trip_stage_review_correction` ON `trip_stage_reviews` (`target_id`) WHERE kind='correction';--> statement-breakpoint
CREATE INDEX `trip_stage_review_document` ON `trip_stage_reviews` (`org_id`,`trip_id`,`document_id`);
--> statement-breakpoint
CREATE TRIGGER trip_stage_review_scope BEFORE INSERT ON trip_stage_reviews
WHEN NOT EXISTS(SELECT 1 FROM trips t
 JOIN memberships m ON m.org_id=t.org_id AND m.user_id=NEW.actor AND m.role='OWNER'
 JOIN trip_stage_documents d ON d.id=NEW.document_id AND d.org_id=t.org_id AND d.trip_id=t.id
 JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_stage'
 WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND t.version=NEW.trip_version AND NEW.trip_version>d.trip_version
 AND json_extract(t.creation_payload,'$.stagePolicyRequest.contract')='workspace_stage_v1'
 AND ((d.stage IN ('placement','loading') AND t.status='planned') OR (d.stage='arrival' AND t.status='dispatched'))
 AND (d.allocation_id IS NULL OR EXISTS(SELECT 1 FROM trip_allocations a WHERE a.id=d.allocation_id AND a.org_id=d.org_id AND a.trip_id=t.id AND a.active=1))
 AND julianday(NEW.event_at) IS NOT NULL AND julianday(NEW.recorded_at) IS NOT NULL
 AND length(NEW.event_at)=24 AND length(NEW.recorded_at)=24
 AND NEW.event_at>=d.created_at AND NEW.event_at<=NEW.recorded_at
 AND NOT EXISTS(SELECT 1 FROM trip_stage_reviews r WHERE r.org_id=t.org_id AND r.trip_id=t.id AND r.document_id=d.id AND (r.event_at>NEW.event_at OR r.trip_version>=NEW.trip_version))
 AND NOT EXISTS(SELECT 1 FROM trip_stage_documents other WHERE other.org_id=t.org_id AND other.trip_id=t.id AND other.trip_version=NEW.trip_version)
 AND NOT EXISTS(SELECT 1 FROM trip_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id AND e.version=NEW.trip_version)
 AND json_extract(NEW.payload,'$.tripId')=t.id AND json_extract(NEW.payload,'$.documentId')=d.id
 AND json_extract(NEW.payload,'$.kind')=NEW.kind AND json_extract(NEW.payload,'$.eventAt')=NEW.event_at AND json_extract(NEW.payload,'$.note')=NEW.note
 AND ((NEW.target_id IS NULL AND json_type(NEW.payload,'$.targetId')='null') OR json_extract(NEW.payload,'$.targetId')=NEW.target_id))
BEGIN SELECT RAISE(ABORT,'Stage review must match its open trip, exact private file, owner and chronology.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_review_active BEFORE INSERT ON trip_stage_reviews
WHEN (NEW.kind<>'correction' AND EXISTS(SELECT 1 FROM trip_stage_reviews r WHERE r.org_id=NEW.org_id AND r.trip_id=NEW.trip_id AND r.document_id=NEW.document_id AND r.kind<>'correction' AND NOT EXISTS(SELECT 1 FROM trip_stage_reviews c WHERE c.org_id=r.org_id AND c.trip_id=r.trip_id AND c.kind='correction' AND c.target_id=r.id)))
 OR (NEW.kind='correction' AND NOT EXISTS(SELECT 1 FROM trip_stage_reviews r WHERE r.id=NEW.target_id AND r.org_id=NEW.org_id AND r.trip_id=NEW.trip_id AND r.document_id=NEW.document_id AND r.kind IN ('accept','reject') AND r.event_at<=NEW.event_at AND NOT EXISTS(SELECT 1 FROM trip_stage_reviews c WHERE c.org_id=r.org_id AND c.trip_id=r.trip_id AND c.kind='correction' AND c.target_id=r.id)))
BEGIN SELECT RAISE(ABORT,'Correct only the active review for this exact stage file.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_review_dependencies BEFORE INSERT ON trip_stage_reviews
WHEN NEW.kind='correction' AND EXISTS(SELECT 1 FROM trip_stage_reviews r WHERE r.id=NEW.target_id AND r.org_id=NEW.org_id AND r.trip_id=NEW.trip_id AND r.kind='accept')
 AND EXISTS(SELECT 1 FROM trip_events e JOIN trip_stage_documents d ON d.id=NEW.document_id AND d.org_id=NEW.org_id AND d.trip_id=NEW.trip_id WHERE e.org_id=NEW.org_id AND e.trip_id=NEW.trip_id
 AND ((d.stage='placement' AND e.kind IN ('placement','loading','arrival','dispatch','delivery','close')) OR (d.stage='loading' AND (e.kind IN ('dispatch','close') OR (e.kind IN ('loading','arrival','delivery') AND e.allocation_id=d.allocation_id))) OR (d.stage='arrival' AND (e.kind='close' OR (e.kind IN ('arrival','delivery') AND e.allocation_id=d.allocation_id))))
 AND NOT EXISTS(SELECT 1 FROM trip_events c WHERE c.org_id=e.org_id AND c.trip_id=e.trip_id AND c.kind='correction' AND c.target_event_id=e.id))
BEGIN SELECT RAISE(ABORT,'Reverse dependent trip progress before correcting accepted evidence.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_review_no_update BEFORE UPDATE ON trip_stage_reviews
BEGIN SELECT RAISE(ABORT,'Stage review history is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_review_no_delete BEFORE DELETE ON trip_stage_reviews
BEGIN SELECT RAISE(ABORT,'Stage review history is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_file_review_version BEFORE INSERT ON trip_stage_documents
WHEN EXISTS(SELECT 1 FROM trip_stage_reviews r WHERE r.org_id=NEW.org_id AND r.trip_id=NEW.trip_id AND r.trip_version=NEW.trip_version)
BEGIN SELECT RAISE(ABORT,'Stage file version already belongs to a review.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_event_version BEFORE INSERT ON trip_events
WHEN EXISTS(SELECT 1 FROM trip_stage_reviews r WHERE r.org_id=NEW.org_id AND r.trip_id=NEW.trip_id AND r.trip_version=NEW.version)
 OR EXISTS(SELECT 1 FROM trip_stage_documents d WHERE d.org_id=NEW.org_id AND d.trip_id=NEW.trip_id AND d.trip_version=NEW.version)
BEGIN SELECT RAISE(ABORT,'Trip version already belongs to stage evidence.'); END;
