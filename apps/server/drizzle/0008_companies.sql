CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`is_agency` integer DEFAULT false NOT NULL,
	`about` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_user_name_idx` ON `companies` (`user_id`,`name`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `company_id` integer REFERENCES companies(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `jobs_company_id_idx` ON `jobs` (`company_id`);