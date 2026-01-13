CREATE TABLE `client_portal_access` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`artisanId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`lastAccessAt` timestamp,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_portal_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_portal_access_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `client_portal_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`sessionToken` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`userAgent` text,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_portal_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_portal_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
--> statement-breakpoint
CREATE TABLE `contrats_maintenance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`reference` varchar(50) NOT NULL,
	`titre` varchar(255) NOT NULL,
	`description` text,
	`montantHT` decimal(10,2) NOT NULL,
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`periodicite` enum('mensuel','trimestriel','semestriel','annuel') NOT NULL,
	`dateDebut` timestamp NOT NULL,
	`dateFin` timestamp,
	`prochainFacturation` timestamp,
	`statut` enum('actif','suspendu','termine','annule') DEFAULT 'actif',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contrats_maintenance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `factures_recurrentes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contratId` int NOT NULL,
	`factureId` int NOT NULL,
	`periodeDebut` timestamp NOT NULL,
	`periodeFin` timestamp NOT NULL,
	`genereeAutomatiquement` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `factures_recurrentes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interventions_mobile` (
	`id` int AUTO_INCREMENT NOT NULL,
	`interventionId` int NOT NULL,
	`artisanId` int NOT NULL,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`heureArrivee` timestamp,
	`heureDepart` timestamp,
	`notesIntervention` text,
	`signatureClient` text,
	`signatureDate` timestamp,
	`syncStatus` enum('synced','pending','error') DEFAULT 'synced',
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interventions_mobile_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `photos_interventions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`interventionMobileId` int NOT NULL,
	`url` varchar(500) NOT NULL,
	`description` varchar(255),
	`type` enum('avant','pendant','apres') DEFAULT 'pendant',
	`takenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `photos_interventions_id` PRIMARY KEY(`id`)
);
