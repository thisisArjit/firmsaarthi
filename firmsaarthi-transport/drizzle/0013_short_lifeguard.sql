CREATE TABLE `trip_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`consignment_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consignment_id`) REFERENCES `consignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_active_consignment` ON `trip_allocations` (`org_id`,`consignment_id`) WHERE active=1;--> statement-breakpoint
CREATE UNIQUE INDEX `trip_consignment_once` ON `trip_allocations` (`trip_id`,`consignment_id`);--> statement-breakpoint
CREATE TABLE `trip_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`allocation_id` text,
	`target_event_id` text,
	`event_at` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`payload` text NOT NULL,
	`actor` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`allocation_id`) REFERENCES `trip_allocations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_event_version` ON `trip_events` (`org_id`,`trip_id`,`version`);--> statement-breakpoint
CREATE TABLE `trip_vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`registration` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_vehicle_registration` ON `trip_vehicles` (`org_id`,`registration`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`year` text NOT NULL,
	`number` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`vehicle_snapshot` text NOT NULL,
	`supplier_party_id` text NOT NULL,
	`supplier_snapshot` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`creation_payload` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `trip_vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_org_number` ON `trips` (`org_id`,`year`,`number`);--> statement-breakpoint
CREATE INDEX `trip_vehicle_status` ON `trips` (`org_id`,`vehicle_id`,`status`);
--> statement-breakpoint
CREATE TRIGGER trip_scope_insert BEFORE INSERT ON trips
WHEN NOT EXISTS(SELECT 1 FROM trip_vehicles v WHERE v.id=NEW.vehicle_id AND v.org_id=NEW.org_id)
 OR NOT EXISTS(SELECT 1 FROM parties p WHERE p.id=NEW.supplier_party_id AND p.org_id=NEW.org_id AND p.kind='supplier')
BEGIN SELECT RAISE(ABORT,'Trip vehicle and supplier must belong to the same company.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_identity_immutable BEFORE UPDATE OF org_id,year,number,vehicle_id,vehicle_snapshot,supplier_party_id,supplier_snapshot,creation_payload,created_at,created_by ON trips
BEGIN SELECT RAISE(ABORT,'Trip identity is immutable. Cancel an incorrect planned trip and create a new one.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_allocation_scope BEFORE INSERT ON trip_allocations
WHEN NOT EXISTS(SELECT 1 FROM trips t JOIN consignments c ON c.id=NEW.consignment_id AND c.org_id=t.org_id
 WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND t.status='planned'
 AND REPLACE(REPLACE(UPPER(c.truck),' ',''),'-','')=t.vehicle_snapshot
 AND json_extract(NEW.snapshot,'$.cn')=c.cn AND json_extract(NEW.snapshot,'$.date')=c.date
 AND json_extract(NEW.snapshot,'$.company')=c.company AND json_extract(NEW.snapshot,'$.origin')=c.origin
 AND json_extract(NEW.snapshot,'$.destination')=c.destination AND json_extract(NEW.snapshot,'$.truck')=c.truck)
BEGIN SELECT RAISE(ABORT,'Consignment allocation changed or belongs to another company or truck. Refresh first.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_allocation_identity BEFORE UPDATE OF org_id,trip_id,consignment_id,snapshot ON trip_allocations
BEGIN SELECT RAISE(ABORT,'Trip allocation snapshots are immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_event_scope BEFORE INSERT ON trip_events
WHEN NOT EXISTS(SELECT 1 FROM trips t WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND t.version=NEW.version)
 OR (NEW.allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM trip_allocations a WHERE a.id=NEW.allocation_id AND a.org_id=NEW.org_id AND a.trip_id=NEW.trip_id))
 OR (NEW.target_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM trip_events e WHERE e.id=NEW.target_event_id AND e.org_id=NEW.org_id AND e.trip_id=NEW.trip_id AND e.version<NEW.version))
BEGIN SELECT RAISE(ABORT,'Trip event must refer to the current trip and its own allocation/history.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_event_immutable BEFORE UPDATE ON trip_events
BEGIN SELECT RAISE(ABORT,'Trip history is immutable. Append a reasoned correction.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_vehicle_immutable BEFORE UPDATE ON trip_vehicles
BEGIN SELECT RAISE(ABORT,'Truck registrations are immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_booking_guard BEFORE UPDATE OF cn,date,company,truck,origin,destination ON consignments
WHEN (NEW.cn<>OLD.cn OR NEW.date<>OLD.date OR NEW.company<>OLD.company OR NEW.truck<>OLD.truck OR NEW.origin<>OLD.origin OR NEW.destination<>OLD.destination)
 AND EXISTS(SELECT 1 FROM trip_allocations a WHERE a.org_id=OLD.org_id AND a.consignment_id=OLD.id AND a.active=1)
BEGIN SELECT RAISE(ABORT,'This booking is allocated to a trip. Cancel a planned trip before changing physical booking details.'); END;
