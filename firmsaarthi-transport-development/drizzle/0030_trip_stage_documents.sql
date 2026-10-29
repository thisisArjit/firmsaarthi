CREATE TABLE `trip_stage_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`allocation_id` text,
	`asset_id` text NOT NULL,
	`stage` text NOT NULL,
	`trip_version` integer NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`payload` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`allocation_id`) REFERENCES `trip_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trip_stage_document_stage" CHECK("trip_stage_documents"."stage" IN ('placement','loading','arrival')),
	CONSTRAINT "trip_stage_document_version_value" CHECK(typeof("trip_stage_documents"."trip_version")='integer' AND "trip_stage_documents"."trip_version">0 AND "trip_stage_documents"."trip_version"<=9007199254740991),
	CONSTRAINT "trip_stage_document_size" CHECK(typeof("trip_stage_documents"."size")='integer' AND "trip_stage_documents"."size">0 AND "trip_stage_documents"."size"<=2097152),
	CONSTRAINT "trip_stage_document_hash" CHECK(length("trip_stage_documents"."sha256")=64 AND "trip_stage_documents"."sha256" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "trip_stage_document_payload" CHECK(json_valid("trip_stage_documents"."payload") AND json_type("trip_stage_documents"."payload")='object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_stage_document_asset` ON `trip_stage_documents` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `trip_stage_document_version` ON `trip_stage_documents` (`org_id`,`trip_id`,`trip_version`);--> statement-breakpoint
CREATE INDEX `trip_stage_document_lookup` ON `trip_stage_documents` (`org_id`,`trip_id`,`stage`,`allocation_id`);
--> statement-breakpoint
CREATE TRIGGER trip_stage_document_scope BEFORE INSERT ON trip_stage_documents
WHEN NOT EXISTS(SELECT 1 FROM trips t
 JOIN memberships m ON m.org_id=t.org_id AND m.user_id=NEW.actor AND m.role='OWNER'
 JOIN assets a ON a.id=NEW.asset_id AND a.org_id=t.org_id
 JOIN asset_scopes scope ON scope.asset_id=a.id AND scope.org_id=a.org_id AND scope.purpose='trip_stage'
 WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND t.version=NEW.trip_version
 AND json_extract(t.creation_payload,'$.stagePolicyRequest.contract')='workspace_stage_v1'
 AND json_type(t.creation_payload,'$.stagePolicySnapshot')='object'
 AND ((NEW.stage IN ('placement','loading') AND t.status='planned') OR (NEW.stage='arrival' AND t.status='dispatched'))
 AND ((NEW.stage='placement' AND NEW.allocation_id IS NULL) OR (NEW.stage IN ('loading','arrival') AND EXISTS(SELECT 1 FROM trip_allocations allocation WHERE allocation.id=NEW.allocation_id AND allocation.org_id=t.org_id AND allocation.trip_id=t.id AND allocation.active=1)))
 AND a.created_at=NEW.created_at AND NEW.created_at>=t.created_at
 AND json_extract(NEW.payload,'$.tripId')=t.id AND json_extract(NEW.payload,'$.stage')=NEW.stage
 AND ((NEW.allocation_id IS NULL AND json_type(NEW.payload,'$.allocationId')='null') OR json_extract(NEW.payload,'$.allocationId')=NEW.allocation_id)
 AND json_extract(NEW.payload,'$.sha256')=NEW.sha256 AND json_extract(NEW.payload,'$.size')=NEW.size
 AND json_extract(NEW.payload,'$.name')=a.name AND json_extract(NEW.payload,'$.type')=a.mime)
BEGIN SELECT RAISE(ABORT,'Stage document must belong to its open trip, allocation and private asset scope.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_document_quota BEFORE INSERT ON trip_stage_documents
WHEN (SELECT COUNT(*) FROM trip_stage_documents WHERE org_id=NEW.org_id AND trip_id=NEW.trip_id AND stage=NEW.stage AND allocation_id IS NEW.allocation_id)>=20
BEGIN SELECT RAISE(ABORT,'Stage document limit reached.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_document_no_update BEFORE UPDATE ON trip_stage_documents
BEGIN SELECT RAISE(ABORT,'Stage documents are immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_document_no_delete BEFORE DELETE ON trip_stage_documents
BEGIN SELECT RAISE(ABORT,'Stage document history is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_asset_no_update BEFORE UPDATE ON assets
WHEN EXISTS(SELECT 1 FROM trip_stage_documents WHERE asset_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Private stage file metadata is immutable.'); END;
