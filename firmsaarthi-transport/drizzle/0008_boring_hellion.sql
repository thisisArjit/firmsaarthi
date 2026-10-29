CREATE TABLE `staff_employees` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`designation` text DEFAULT '' NOT NULL,
	`branch` text DEFAULT '' NOT NULL,
	`joined_on` text NOT NULL,
	`left_on` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_employee_code` ON `staff_employees` (`org_id`,`code`);--> statement-breakpoint
CREATE TABLE `staff_salary_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`monthly_amount` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `staff_employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_salary_effective` ON `staff_salary_terms` (`org_id`,`employee_id`,`effective_from`);