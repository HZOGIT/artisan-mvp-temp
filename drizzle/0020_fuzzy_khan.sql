CREATE TABLE `pointages_chantier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`chantierId` int NOT NULL,
	`phaseId` int,
	`technicienId` int,
	`date` date NOT NULL,
	`heures` decimal(6,2) NOT NULL,
	`description` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pointages_chantier_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `phases_chantier` ADD `heuresPrevues` decimal(7,2);