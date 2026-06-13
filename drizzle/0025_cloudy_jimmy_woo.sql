CREATE TABLE `interventions_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`interventionId` int NOT NULL,
	`technicienId` int NOT NULL,
	`role` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interventions_techniciens_id` PRIMARY KEY(`id`)
);
