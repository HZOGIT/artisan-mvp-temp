CREATE TABLE `assurances_vehicules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehiculeId` int NOT NULL,
	`compagnie` varchar(255) NOT NULL,
	`numeroContrat` varchar(100),
	`typeAssurance` enum('tiers','tiers_plus','tous_risques') DEFAULT 'tiers',
	`dateDebut` date NOT NULL,
	`dateFin` date NOT NULL,
	`primeAnnuelle` decimal(10,2),
	`franchise` decimal(10,2),
	`document` text,
	`alerteEnvoyee` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assurances_vehicules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `badges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`code` varchar(50) NOT NULL,
	`nom` varchar(100) NOT NULL,
	`description` text,
	`icone` varchar(50),
	`couleur` varchar(20),
	`categorie` enum('interventions','avis','ca','anciennete','special') DEFAULT 'interventions',
	`condition` text,
	`seuil` int,
	`points` int DEFAULT 10,
	`actif` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `badges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `badges_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`badgeId` int NOT NULL,
	`dateObtention` timestamp NOT NULL DEFAULT (now()),
	`valeurAtteinte` int,
	`notifie` boolean DEFAULT false,
	CONSTRAINT `badges_techniciens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classement_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`artisanId` int NOT NULL,
	`periode` enum('semaine','mois','trimestre','annee') NOT NULL,
	`dateDebut` date NOT NULL,
	`dateFin` date NOT NULL,
	`rang` int NOT NULL,
	`pointsTotal` int DEFAULT 0,
	`interventions` int DEFAULT 0,
	`ca` decimal(10,2) DEFAULT '0.00',
	`noteMoyenne` decimal(3,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classement_techniciens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_alertes_previsions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`seuilAlertePositif` decimal(5,2) DEFAULT '10.00',
	`seuilAlerteNegatif` decimal(5,2) DEFAULT '10.00',
	`alerteEmail` boolean DEFAULT true,
	`alerteSms` boolean DEFAULT false,
	`emailDestination` varchar(320),
	`telephoneDestination` varchar(20),
	`frequenceVerification` enum('quotidien','hebdomadaire','mensuel') DEFAULT 'hebdomadaire',
	`actif` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `config_alertes_previsions_id` PRIMARY KEY(`id`),
	CONSTRAINT `config_alertes_previsions_artisanId_unique` UNIQUE(`artisanId`)
);
--> statement-breakpoint
CREATE TABLE `entretiens_vehicules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehiculeId` int NOT NULL,
	`type` enum('vidange','pneus','freins','controle_technique','revision','reparation','autre') NOT NULL,
	`dateEntretien` date NOT NULL,
	`kilometrageEntretien` int,
	`cout` decimal(10,2),
	`prestataire` varchar(255),
	`description` text,
	`prochainEntretienKm` int,
	`prochainEntretienDate` date,
	`facture` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entretiens_vehicules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historique_alertes_previsions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`mois` int NOT NULL,
	`annee` int NOT NULL,
	`typeAlerte` enum('depassement_positif','depassement_negatif') NOT NULL,
	`caPrevisionnel` decimal(12,2),
	`caRealise` decimal(12,2),
	`ecartPourcentage` decimal(5,2),
	`canalEnvoi` enum('email','sms','les_deux') NOT NULL,
	`dateEnvoi` timestamp NOT NULL DEFAULT (now()),
	`statut` enum('envoye','echec','lu') DEFAULT 'envoye',
	`message` text,
	CONSTRAINT `historique_alertes_previsions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historique_kilometrage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehiculeId` int NOT NULL,
	`technicienId` int,
	`kilometrage` int NOT NULL,
	`dateReleve` date NOT NULL,
	`motif` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historique_kilometrage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `objectifs_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`artisanId` int NOT NULL,
	`mois` int NOT NULL,
	`annee` int NOT NULL,
	`objectifInterventions` int DEFAULT 0,
	`objectifCA` decimal(10,2) DEFAULT '0.00',
	`objectifAvisPositifs` int DEFAULT 0,
	`interventionsRealisees` int DEFAULT 0,
	`caRealise` decimal(10,2) DEFAULT '0.00',
	`avisPositifsObtenus` int DEFAULT 0,
	`pointsGagnes` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `objectifs_techniciens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`immatriculation` varchar(20) NOT NULL,
	`marque` varchar(100),
	`modele` varchar(100),
	`annee` int,
	`typeCarburant` enum('essence','diesel','electrique','hybride','gpl') DEFAULT 'diesel',
	`kilometrageActuel` int DEFAULT 0,
	`dateAchat` date,
	`prixAchat` decimal(10,2),
	`technicienId` int,
	`statut` enum('actif','en_maintenance','hors_service','vendu') DEFAULT 'actif',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicules_id` PRIMARY KEY(`id`)
);
