CREATE TABLE `asset_scopes` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`purpose` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gps_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`authorization_reference` text NOT NULL,
	`encrypted_token` text,
	`status` text DEFAULT 'unconfigured' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gps_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`provider_vehicle_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `gps_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `trip_vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gps_mapping_provider_vehicle` ON `gps_mappings` (`org_id`,`connection_id`,`provider_vehicle_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gps_mapping_local_vehicle` ON `gps_mappings` (`org_id`,`connection_id`,`vehicle_id`);--> statement-breakpoint
CREATE TABLE `gps_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`provider_vehicle_id` text NOT NULL,
	`registration` text NOT NULL,
	`observed_at` text NOT NULL,
	`latitude` text NOT NULL,
	`longitude` text NOT NULL,
	`speed` text,
	`speed_observed_at` text,
	`received_at` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `gps_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `trip_vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gps_fix_identity` ON `gps_observations` (`org_id`,`connection_id`,`provider_vehicle_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `gps_fix_vehicle` ON `gps_observations` (`org_id`,`vehicle_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `vehicle_document_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`document_id` text NOT NULL,
	`method` text NOT NULL,
	`checked_on` text NOT NULL,
	`reference` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `vehicle_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vehicle_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`kind` text NOT NULL,
	`number` text NOT NULL,
	`issued_on` text,
	`valid_until` text,
	`source_reference` text NOT NULL,
	`asset_id` text,
	`details` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'recorded' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`void_reason` text DEFAULT '' NOT NULL,
	`voided_at` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `trip_vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vehicle_document_lookup` ON `vehicle_documents` (`org_id`,`vehicle_id`,`kind`);
--> statement-breakpoint
CREATE TRIGGER vehicle_document_scope BEFORE INSERT ON vehicle_documents
WHEN NOT EXISTS(SELECT 1 FROM trip_vehicles v WHERE v.id=NEW.vehicle_id AND v.org_id=NEW.org_id)
 OR (NEW.asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assets a JOIN asset_scopes x ON x.asset_id=a.id AND x.org_id=a.org_id WHERE a.id=NEW.asset_id AND a.org_id=NEW.org_id AND x.purpose='vehicle_document'))
BEGIN SELECT RAISE(ABORT,'Vehicle document and attachment must belong to the same company and document scope.'); END;
--> statement-breakpoint
CREATE TRIGGER vehicle_document_immutable BEFORE UPDATE OF org_id,vehicle_id,kind,number,issued_on,valid_until,source_reference,asset_id,details,created_by,created_at ON vehicle_documents
BEGIN SELECT RAISE(ABORT,'Document source fields are immutable. Void with a reason and record a corrected document.'); END;
--> statement-breakpoint
CREATE TRIGGER vehicle_review_scope BEFORE INSERT ON vehicle_document_reviews
WHEN NOT EXISTS(SELECT 1 FROM vehicle_documents d WHERE d.id=NEW.document_id AND d.org_id=NEW.org_id AND d.status='recorded')
BEGIN SELECT RAISE(ABORT,'Review must belong to a current document in the same company.'); END;
--> statement-breakpoint
CREATE TRIGGER vehicle_review_immutable BEFORE UPDATE ON vehicle_document_reviews
BEGIN SELECT RAISE(ABORT,'Document reviews are immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER asset_scope_company BEFORE INSERT ON asset_scopes
WHEN NOT EXISTS(SELECT 1 FROM assets a WHERE a.id=NEW.asset_id AND a.org_id=NEW.org_id)
BEGIN SELECT RAISE(ABORT,'Attachment scope must belong to the same company.'); END;
--> statement-breakpoint
CREATE TRIGGER asset_scope_immutable BEFORE UPDATE ON asset_scopes
BEGIN SELECT RAISE(ABORT,'Attachment scope cannot be changed.'); END;
--> statement-breakpoint
CREATE TRIGGER gps_connection_identity BEFORE UPDATE OF org_id,provider ON gps_connections
BEGIN SELECT RAISE(ABORT,'GPS connection company and provider are immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER gps_mapping_scope BEFORE INSERT ON gps_mappings
WHEN NOT EXISTS(SELECT 1 FROM gps_connections c JOIN trip_vehicles v ON v.org_id=c.org_id WHERE c.id=NEW.connection_id AND c.org_id=NEW.org_id AND v.id=NEW.vehicle_id)
BEGIN SELECT RAISE(ABORT,'GPS mapping must belong to the same company connection and vehicle.'); END;
--> statement-breakpoint
CREATE TRIGGER gps_mapping_immutable BEFORE UPDATE ON gps_mappings
BEGIN SELECT RAISE(ABORT,'Remove an incorrect mapping and add its correction.'); END;
--> statement-breakpoint
CREATE TRIGGER gps_observation_scope BEFORE INSERT ON gps_observations
WHEN NOT EXISTS(SELECT 1 FROM gps_mappings m WHERE m.org_id=NEW.org_id AND m.connection_id=NEW.connection_id AND m.vehicle_id=NEW.vehicle_id AND m.provider_vehicle_id=NEW.provider_vehicle_id)
BEGIN SELECT RAISE(ABORT,'GPS observation must refer to an explicit company vehicle mapping.'); END;
--> statement-breakpoint
CREATE TRIGGER gps_observation_immutable BEFORE UPDATE ON gps_observations
BEGIN SELECT RAISE(ABORT,'Received GPS observations are immutable.'); END;
