CREATE TABLE `staff_advances` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`created_at` text NOT NULL,
	`voided_at` text,
	`void_reason` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `staff_employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_advance_employee_date` ON `staff_advances` (`org_id`,`employee_id`,`date`);--> statement-breakpoint
CREATE TABLE `staff_payrun_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`payrun_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`gross` integer NOT NULL,
	`deductions` integer DEFAULT 0 NOT NULL,
	`employer_cost` integer DEFAULT 0 NOT NULL,
	`advance_recovery` integer DEFAULT 0 NOT NULL,
	`net_pay` integer NOT NULL,
	`reviewed` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payrun_id`) REFERENCES `staff_payruns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `staff_employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_payrun_employee` ON `staff_payrun_lines` (`org_id`,`payrun_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `staff_payrun_employee_lookup` ON `staff_payrun_lines` (`org_id`,`employee_id`);--> statement-breakpoint
CREATE TABLE `staff_payruns` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`period` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`finance_entry_id` text,
	`created_at` text NOT NULL,
	`posted_at` text,
	`approved_by` text,
	`voided_at` text,
	`void_reason` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`finance_entry_id`) REFERENCES `finance_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_regular_payrun_period` ON `staff_payruns` (`org_id`,`period`) WHERE status <> 'void';--> statement-breakpoint
CREATE TABLE `staff_salary_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`line_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`created_at` text NOT NULL,
	`voided_at` text,
	`void_reason` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`line_id`) REFERENCES `staff_payrun_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_payment_line` ON `staff_salary_payments` (`org_id`,`line_id`);
--> statement-breakpoint
CREATE VIEW staff_advance_ledger AS
SELECT id,org_id,employee_id,date,CASE WHEN kind='advance' THEN amount ELSE -amount END AS delta,kind AS source,reference FROM staff_advances WHERE status='posted'
UNION ALL
SELECT l.id,l.org_id,l.employee_id,p.period_end,-l.advance_recovery,'payroll_recovery',p.period FROM staff_payrun_lines l JOIN staff_payruns p ON p.id=l.payrun_id AND p.org_id=l.org_id WHERE p.status='posted' AND l.advance_recovery>0;
--> statement-breakpoint
CREATE TRIGGER staff_advance_insert_balance AFTER INSERT ON staff_advances
WHEN EXISTS(SELECT 1 FROM (SELECT SUM(delta) OVER(ORDER BY date) balance FROM (SELECT date,SUM(delta) delta FROM staff_advance_ledger WHERE org_id=NEW.org_id AND employee_id=NEW.employee_id GROUP BY date)) WHERE balance<0)
BEGIN SELECT RAISE(ABORT,'Advance repayment exceeds the available balance on its date.'); END;
--> statement-breakpoint
CREATE TRIGGER staff_advance_void_balance AFTER UPDATE OF status ON staff_advances
WHEN EXISTS(SELECT 1 FROM (SELECT SUM(delta) OVER(ORDER BY date) balance FROM (SELECT date,SUM(delta) delta FROM staff_advance_ledger WHERE org_id=NEW.org_id AND employee_id=NEW.employee_id GROUP BY date)) WHERE balance<0)
BEGIN SELECT RAISE(ABORT,'This change would make the employee advance balance negative.'); END;
--> statement-breakpoint
CREATE TRIGGER staff_payrun_advance_balance AFTER UPDATE OF status ON staff_payruns
WHEN NEW.status='posted' AND EXISTS(SELECT 1 FROM (SELECT SUM(delta) OVER(PARTITION BY employee_id ORDER BY date) balance FROM (SELECT employee_id,date,SUM(delta) delta FROM staff_advance_ledger WHERE org_id=NEW.org_id GROUP BY employee_id,date)) WHERE balance<0)
BEGIN SELECT RAISE(ABORT,'Payroll recovery exceeds an available employee advance balance.'); END;
--> statement-breakpoint
CREATE TRIGGER staff_payrun_payment_protection BEFORE UPDATE OF status ON staff_payruns
WHEN NEW.status='void' AND EXISTS(SELECT 1 FROM staff_salary_payments x JOIN staff_payrun_lines l ON l.id=x.line_id AND l.org_id=x.org_id WHERE l.payrun_id=OLD.id AND l.org_id=OLD.org_id AND x.status='posted')
BEGIN SELECT RAISE(ABORT,'Void recorded salary payments before voiding this pay run.'); END;
--> statement-breakpoint
CREATE TRIGGER staff_salary_payment_limit BEFORE INSERT ON staff_salary_payments
WHEN (SELECT status FROM staff_payruns WHERE id=(SELECT payrun_id FROM staff_payrun_lines WHERE id=NEW.line_id AND org_id=NEW.org_id) AND org_id=NEW.org_id)<>'posted'
OR NEW.amount<=0 OR NEW.amount>(SELECT net_pay-COALESCE((SELECT SUM(amount) FROM staff_salary_payments WHERE line_id=NEW.line_id AND org_id=NEW.org_id AND status='posted'),0) FROM staff_payrun_lines WHERE id=NEW.line_id AND org_id=NEW.org_id)
BEGIN SELECT RAISE(ABORT,'Salary payment exceeds the remaining balance or the pay run is not posted.'); END;
--> statement-breakpoint
CREATE TRIGGER staff_payroll_line_locked BEFORE UPDATE ON staff_payrun_lines
WHEN (SELECT status FROM staff_payruns WHERE id=OLD.payrun_id AND org_id=OLD.org_id)<>'draft'
BEGIN SELECT RAISE(ABORT,'Posted payroll lines are immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER staff_payroll_history_preserved BEFORE DELETE ON staff_payrun_lines
WHEN (SELECT status FROM staff_payruns WHERE id=OLD.payrun_id AND org_id=OLD.org_id)<>'draft'
BEGIN SELECT RAISE(ABORT,'Payroll history cannot be deleted.'); END;
