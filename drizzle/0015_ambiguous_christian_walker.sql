CREATE TABLE `preferences_couleurs_calendrier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`interventionId` int NOT NULL,
	`couleur` varchar(50) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `preferences_couleurs_calendrier_id` PRIMARY KEY(`id`)
);
