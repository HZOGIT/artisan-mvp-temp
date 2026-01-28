ALTER TABLE `configurations_comptables` ADD `syncAutoFactures` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `configurations_comptables` ADD `syncAutoPaiements` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `configurations_comptables` ADD `frequenceSync` enum('quotidien','hebdomadaire','mensuel','manuel') DEFAULT 'manuel';--> statement-breakpoint
ALTER TABLE `configurations_comptables` ADD `heureSync` varchar(5) DEFAULT '02:00';--> statement-breakpoint
ALTER TABLE `configurations_comptables` ADD `notifierErreurs` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `configurations_comptables` ADD `notifierSucces` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `configurations_comptables` ADD `derniereSync` timestamp;--> statement-breakpoint
ALTER TABLE `configurations_comptables` ADD `prochainSync` timestamp;