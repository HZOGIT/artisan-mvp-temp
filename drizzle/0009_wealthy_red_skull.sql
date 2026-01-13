CREATE TABLE `devis_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devisId` int NOT NULL,
	`nom` varchar(100) NOT NULL,
	`description` text,
	`ordre` int DEFAULT 1,
	`totalHT` decimal(10,2) DEFAULT '0.00',
	`totalTVA` decimal(10,2) DEFAULT '0.00',
	`totalTTC` decimal(10,2) DEFAULT '0.00',
	`recommandee` boolean DEFAULT false,
	`selectionnee` boolean DEFAULT false,
	`dateSelection` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devis_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devis_options_lignes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`optionId` int NOT NULL,
	`articleId` int,
	`designation` varchar(255) NOT NULL,
	`description` text,
	`quantite` decimal(10,2) DEFAULT '1.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) DEFAULT '0.00',
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`remise` decimal(5,2) DEFAULT '0.00',
	`montantHT` decimal(10,2) DEFAULT '0.00',
	`montantTVA` decimal(10,2) DEFAULT '0.00',
	`montantTTC` decimal(10,2) DEFAULT '0.00',
	`ordre` int DEFAULT 1,
	CONSTRAINT `devis_options_lignes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ecritures_comptables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`dateEcriture` timestamp NOT NULL,
	`journal` enum('VE','AC','BQ','OD') NOT NULL,
	`numeroCompte` varchar(10) NOT NULL,
	`libelleCompte` varchar(100),
	`libelle` varchar(255) NOT NULL,
	`pieceRef` varchar(50),
	`debit` decimal(12,2) DEFAULT '0.00',
	`credit` decimal(12,2) DEFAULT '0.00',
	`factureId` int,
	`lettrage` varchar(10),
	`pointage` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ecritures_comptables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historique_deplacements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`interventionId` int,
	`dateDebut` timestamp NOT NULL,
	`dateFin` timestamp,
	`distanceKm` decimal(8,2),
	`dureeMinutes` int,
	`latitudeDepart` decimal(10,8),
	`longitudeDepart` decimal(11,8),
	`latitudeArrivee` decimal(10,8),
	`longitudeArrivee` decimal(11,8),
	`adresseDepart` text,
	`adresseArrivee` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historique_deplacements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plan_comptable` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`numeroCompte` varchar(10) NOT NULL,
	`libelle` varchar(100) NOT NULL,
	`classe` int NOT NULL,
	`type` enum('actif','passif','charge','produit') NOT NULL,
	`actif` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `plan_comptable_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `positions_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`latitude` decimal(10,8) NOT NULL,
	`longitude` decimal(11,8) NOT NULL,
	`precision` int,
	`vitesse` decimal(5,2),
	`cap` int,
	`batterie` int,
	`enDeplacement` boolean DEFAULT false,
	`interventionEnCoursId` int,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `positions_techniciens_id` PRIMARY KEY(`id`)
);
