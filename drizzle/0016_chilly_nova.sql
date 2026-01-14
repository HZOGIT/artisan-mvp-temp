CREATE TABLE `config_relances_auto` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`actif` boolean DEFAULT false,
	`joursApresEnvoi` int DEFAULT 7,
	`joursEntreRelances` int DEFAULT 7,
	`nombreMaxRelances` int DEFAULT 3,
	`heureEnvoi` varchar(5) DEFAULT '09:00',
	`joursEnvoi` varchar(50) DEFAULT '1,2,3,4,5',
	`modeleEmailId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `config_relances_auto_id` PRIMARY KEY(`id`),
	CONSTRAINT `config_relances_auto_artisanId_unique` UNIQUE(`artisanId`)
);
