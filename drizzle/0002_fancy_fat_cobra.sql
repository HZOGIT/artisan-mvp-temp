ALTER TABLE `users` ADD `resetToken` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `resetTokenExpiry` timestamp;