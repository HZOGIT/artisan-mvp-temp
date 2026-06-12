ALTER TABLE `artisans` ADD `formeJuridique` enum('EI','micro','EURL','SARL','SAS','SASU','SA','autre');--> statement-breakpoint
ALTER TABLE `artisans` ADD `capitalSocial` decimal(12,2);--> statement-breakpoint
ALTER TABLE `artisans` ADD `villeRCS` varchar(100);--> statement-breakpoint
ALTER TABLE `artisans` ADD `numeroRM` varchar(50);