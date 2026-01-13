CREATE TABLE `relances_devis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devisId` int NOT NULL,
	`artisanId` int NOT NULL,
	`type` enum('email','notification') NOT NULL,
	`destinataire` varchar(320),
	`message` text,
	`statut` enum('envoye','echec') DEFAULT 'envoye',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relances_devis_id` PRIMARY KEY(`id`)
);
