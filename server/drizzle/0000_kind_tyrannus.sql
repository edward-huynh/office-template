CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`template_version` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`owner_session_id` text NOT NULL,
	`file_path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_owner_idx` ON `documents` (`owner_session_id`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`file_path` text NOT NULL,
	`thumbnail_path` text NOT NULL,
	`preview_pages` text NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `templates_type_idx` ON `templates` (`type`);--> statement-breakpoint
CREATE INDEX `templates_category_idx` ON `templates` (`category`);