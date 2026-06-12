CREATE TABLE `activites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`type` enum('appel','email','rdv','relance','autre') NOT NULL DEFAULT 'autre',
	`titre` varchar(500) NOT NULL,
	`echeance` date NOT NULL,
	`entiteType` enum('client','devis','facture','chantier','aucun') DEFAULT 'aucun',
	`entiteId` int,
	`responsableUserId` int,
	`fait` boolean NOT NULL DEFAULT false,
	`faitAt` timestamp,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activites_id` PRIMARY KEY(`id`)
);
