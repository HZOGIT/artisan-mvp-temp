CREATE TABLE `analyses_photos_chantier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int,
	`titre` varchar(255),
	`description` text,
	`statut` enum('en_attente','en_cours','termine','erreur') DEFAULT 'en_attente',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analyses_photos_chantier_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chantiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`reference` varchar(50) NOT NULL,
	`nom` varchar(255) NOT NULL,
	`description` text,
	`adresse` text,
	`codePostal` varchar(10),
	`ville` varchar(100),
	`dateDebut` date,
	`dateFinPrevue` date,
	`dateFinReelle` date,
	`budgetPrevisionnel` decimal(12,2),
	`budgetRealise` decimal(12,2) DEFAULT '0.00',
	`statut` enum('planifie','en_cours','en_pause','termine','annule') DEFAULT 'planifie',
	`avancement` int DEFAULT 0,
	`priorite` enum('basse','normale','haute','urgente') DEFAULT 'normale',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chantiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `configurations_comptables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`logiciel` enum('sage','quickbooks','ciel','ebp','autre') DEFAULT 'sage',
	`formatExport` enum('fec','iif','qbo','csv') DEFAULT 'fec',
	`compteVentes` varchar(20) DEFAULT '706000',
	`compteTVACollectee` varchar(20) DEFAULT '445710',
	`compteClients` varchar(20) DEFAULT '411000',
	`compteAchats` varchar(20) DEFAULT '607000',
	`compteTVADeductible` varchar(20) DEFAULT '445660',
	`compteFournisseurs` varchar(20) DEFAULT '401000',
	`compteBanque` varchar(20) DEFAULT '512000',
	`compteCaisse` varchar(20) DEFAULT '530000',
	`journalVentes` varchar(10) DEFAULT 'VE',
	`journalAchats` varchar(10) DEFAULT 'AC',
	`journalBanque` varchar(10) DEFAULT 'BQ',
	`prefixeFacture` varchar(10) DEFAULT 'FA',
	`prefixeAvoir` varchar(10) DEFAULT 'AV',
	`exerciceDebut` int DEFAULT 1,
	`actif` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `configurations_comptables_id` PRIMARY KEY(`id`),
	CONSTRAINT `configurations_comptables_artisanId_unique` UNIQUE(`artisanId`)
);
--> statement-breakpoint
CREATE TABLE `devis_genere_ia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analyseId` int NOT NULL,
	`devisId` int,
	`montantEstime` decimal(12,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `devis_genere_ia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents_chantier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chantierId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`type` enum('plan','photo','permis','contrat','facture','autre') DEFAULT 'autre',
	`url` text NOT NULL,
	`taille` int,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_chantier_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exports_comptables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`logiciel` enum('sage','quickbooks','ciel','ebp','autre') NOT NULL,
	`formatExport` enum('fec','iif','qbo','csv') NOT NULL,
	`periodeDebut` date NOT NULL,
	`periodeFin` date NOT NULL,
	`nombreEcritures` int DEFAULT 0,
	`montantTotal` decimal(12,2),
	`fichierUrl` text,
	`statut` enum('en_cours','termine','erreur') DEFAULT 'en_cours',
	`erreur` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exports_comptables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interventions_chantier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chantierId` int NOT NULL,
	`interventionId` int NOT NULL,
	`phaseId` int,
	`ordre` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interventions_chantier_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `phases_chantier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chantierId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`description` text,
	`ordre` int DEFAULT 1,
	`dateDebutPrevue` date,
	`dateFinPrevue` date,
	`dateDebutReelle` date,
	`dateFinReelle` date,
	`statut` enum('a_faire','en_cours','termine','annule') DEFAULT 'a_faire',
	`avancement` int DEFAULT 0,
	`budgetPhase` decimal(10,2),
	`coutReel` decimal(10,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `phases_chantier_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `photos_analyse` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analyseId` int NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`ordre` int DEFAULT 1,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `photos_analyse_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resultats_analyse_ia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analyseId` int NOT NULL,
	`typeTravauxDetecte` varchar(255),
	`descriptionTravaux` text,
	`urgence` enum('faible','moyenne','haute','critique') DEFAULT 'moyenne',
	`confiance` decimal(5,2),
	`rawResponse` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resultats_analyse_ia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suggestions_articles_ia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resultatId` int NOT NULL,
	`articleId` int,
	`nomArticle` varchar(255) NOT NULL,
	`description` text,
	`quantiteSuggeree` decimal(10,2) DEFAULT '1.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixEstime` decimal(10,2),
	`confiance` decimal(5,2),
	`selectionne` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suggestions_articles_ia_id` PRIMARY KEY(`id`)
);
