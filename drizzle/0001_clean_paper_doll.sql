CREATE TABLE `articles_artisan` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`reference` varchar(50) NOT NULL,
	`designation` varchar(500) NOT NULL,
	`description` text,
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) NOT NULL,
	`categorie` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `articles_artisan_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `artisans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`siret` varchar(14),
	`nomEntreprise` varchar(255),
	`adresse` text,
	`codePostal` varchar(10),
	`ville` varchar(100),
	`telephone` varchar(20),
	`email` varchar(320),
	`specialite` enum('plomberie','electricite','chauffage','multi-services') DEFAULT 'plomberie',
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`logo` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `artisans_id` PRIMARY KEY(`id`),
	CONSTRAINT `artisans_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `bibliotheque_articles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reference` varchar(50) NOT NULL,
	`designation` varchar(500) NOT NULL,
	`description` text,
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) NOT NULL,
	`categorie` varchar(100),
	`sousCategorie` varchar(100),
	`metier` enum('plomberie','electricite','chauffage','general') DEFAULT 'general',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bibliotheque_articles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`prenom` varchar(255),
	`email` varchar(320),
	`telephone` varchar(20),
	`adresse` text,
	`codePostal` varchar(10),
	`ville` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`numero` varchar(50) NOT NULL,
	`dateDevis` timestamp NOT NULL DEFAULT (now()),
	`dateValidite` timestamp,
	`statut` enum('brouillon','envoye','accepte','refuse','expire') DEFAULT 'brouillon',
	`objet` text,
	`conditionsPaiement` text,
	`notes` text,
	`totalHT` decimal(10,2) DEFAULT '0.00',
	`totalTVA` decimal(10,2) DEFAULT '0.00',
	`totalTTC` decimal(10,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devis_lignes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devisId` int NOT NULL,
	`ordre` int DEFAULT 0,
	`reference` varchar(50),
	`designation` varchar(500) NOT NULL,
	`description` text,
	`quantite` decimal(10,2) DEFAULT '1.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) NOT NULL,
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`montantHT` decimal(10,2) DEFAULT '0.00',
	`montantTVA` decimal(10,2) DEFAULT '0.00',
	`montantTTC` decimal(10,2) DEFAULT '0.00',
	CONSTRAINT `devis_lignes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `factures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`devisId` int,
	`numero` varchar(50) NOT NULL,
	`dateFacture` timestamp NOT NULL DEFAULT (now()),
	`dateEcheance` timestamp,
	`statut` enum('brouillon','envoyee','payee','en_retard','annulee') DEFAULT 'brouillon',
	`objet` text,
	`conditionsPaiement` text,
	`notes` text,
	`totalHT` decimal(10,2) DEFAULT '0.00',
	`totalTVA` decimal(10,2) DEFAULT '0.00',
	`totalTTC` decimal(10,2) DEFAULT '0.00',
	`montantPaye` decimal(10,2) DEFAULT '0.00',
	`datePaiement` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `factures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `factures_lignes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`factureId` int NOT NULL,
	`ordre` int DEFAULT 0,
	`reference` varchar(50),
	`designation` varchar(500) NOT NULL,
	`description` text,
	`quantite` decimal(10,2) DEFAULT '1.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) NOT NULL,
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`montantHT` decimal(10,2) DEFAULT '0.00',
	`montantTVA` decimal(10,2) DEFAULT '0.00',
	`montantTTC` decimal(10,2) DEFAULT '0.00',
	CONSTRAINT `factures_lignes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interventions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`titre` varchar(255) NOT NULL,
	`description` text,
	`dateDebut` timestamp NOT NULL,
	`dateFin` timestamp,
	`statut` enum('planifiee','en_cours','terminee','annulee') DEFAULT 'planifiee',
	`adresse` text,
	`notes` text,
	`devisId` int,
	`factureId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `interventions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`type` enum('info','alerte','rappel','succes','erreur') DEFAULT 'info',
	`titre` varchar(255) NOT NULL,
	`message` text,
	`lien` varchar(500),
	`lu` boolean DEFAULT false,
	`archived` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parametres_artisan` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`prefixeDevis` varchar(10) DEFAULT 'DEV',
	`prefixeFacture` varchar(10) DEFAULT 'FAC',
	`compteurDevis` int DEFAULT 1,
	`compteurFacture` int DEFAULT 1,
	`mentionsLegales` text,
	`conditionsGenerales` text,
	`notificationsEmail` boolean DEFAULT true,
	`rappelDevisJours` int DEFAULT 7,
	`rappelFactureJours` int DEFAULT 30,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parametres_artisan_id` PRIMARY KEY(`id`),
	CONSTRAINT `parametres_artisan_artisanId_unique` UNIQUE(`artisanId`)
);
