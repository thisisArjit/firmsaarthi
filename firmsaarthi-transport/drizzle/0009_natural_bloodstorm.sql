DROP INDEX `staff_salary_effective`;--> statement-breakpoint
ALTER TABLE `staff_salary_terms` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `staff_salary_terms` ADD `void_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `staff_salary_effective` ON `staff_salary_terms` (`org_id`,`employee_id`,`effective_from`) WHERE voided_at IS NULL;