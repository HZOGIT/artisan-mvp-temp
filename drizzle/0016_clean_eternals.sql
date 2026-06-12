CREATE TABLE `demandes_contact` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(200) NOT NULL,
	`email` varchar(320),
	`telephone` varchar(30),
	`message` text,
	`source` varchar(50) DEFAULT 'vitrine',
	`statut_demande_contact` enum('nouveau','contacte','converti','perdu') DEFAULT 'nouveau',
	`clientId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `demandes_contact_id` PRIMARY KEY(`id`)
);
