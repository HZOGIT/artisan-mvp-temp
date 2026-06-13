CREATE TABLE `emails_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int,
	`destinataire` varchar(320) NOT NULL,
	`sujet` varchar(500) NOT NULL,
	`type` varchar(50),
	`resendId` varchar(255),
	`statut` varchar(20) NOT NULL,
	`erreur` text,
	`entiteType` varchar(50),
	`entiteId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `emails_log_id` PRIMARY KEY(`id`)
);
