ALTER TABLE `clients` ADD `type` enum('particulier','professionnel') DEFAULT 'particulier';--> statement-breakpoint
ALTER TABLE `clients` ADD `raisonSociale` varchar(255);--> statement-breakpoint
ALTER TABLE `clients` ADD `siret` varchar(14);--> statement-breakpoint
ALTER TABLE `clients` ADD `numeroTVA` varchar(20);