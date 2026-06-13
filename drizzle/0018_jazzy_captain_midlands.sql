CREATE TABLE `habilitations_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`artisanId` int NOT NULL,
	`type` varchar(255) NOT NULL,
	`numero` varchar(100),
	`organisme` varchar(255),
	`dateObtention` date,
	`dateExpiration` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `habilitations_techniciens_id` PRIMARY KEY(`id`)
);
