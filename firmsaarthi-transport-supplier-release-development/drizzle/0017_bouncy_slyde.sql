CREATE TABLE `trip_document_reviews` (
	`event_id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`org_id` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `trip_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `trip_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trip_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`allocation_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`payload` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`allocation_id`) REFERENCES `trip_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_document_asset` ON `trip_documents` (`asset_id`);--> statement-breakpoint
CREATE INDEX `trip_document_allocation` ON `trip_documents` (`org_id`,`trip_id`,`allocation_id`);
--> statement-breakpoint
CREATE TRIGGER trip_document_scope BEFORE INSERT ON trip_documents
WHEN NOT EXISTS(SELECT 1 FROM trip_allocations a JOIN trips t ON t.id=a.trip_id AND t.org_id=a.org_id
 JOIN assets f ON f.id=NEW.asset_id AND f.org_id=a.org_id JOIN asset_scopes s ON s.asset_id=f.id AND s.org_id=f.org_id AND s.purpose='trip_pod'
 WHERE a.id=NEW.allocation_id AND a.org_id=NEW.org_id AND a.trip_id=NEW.trip_id AND a.active=1 AND t.status='dispatched')
 OR NEW.size<1 OR NEW.size>2097152 OR length(NEW.sha256)<>64
BEGIN SELECT RAISE(ABORT,'POD document must belong to the open trip and private asset scope.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_document_immutable BEFORE UPDATE ON trip_documents
BEGIN SELECT RAISE(ABORT,'POD documents are immutable. Upload a replacement and retain the original.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_document_review_scope BEFORE INSERT ON trip_document_reviews
WHEN NOT EXISTS(SELECT 1 FROM trip_documents d JOIN trip_events e ON e.id=NEW.event_id AND e.org_id=d.org_id AND e.trip_id=d.trip_id AND e.allocation_id=d.allocation_id
 WHERE d.id=NEW.document_id AND d.org_id=NEW.org_id AND e.kind IN('pod_accept','pod_reject') AND e.event_at>=d.created_at)
BEGIN SELECT RAISE(ABORT,'POD review must refer to its own consignment document.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_document_review_immutable BEFORE UPDATE ON trip_document_reviews
BEGIN SELECT RAISE(ABORT,'POD review links are immutable. Correct the trip event.'); END;
