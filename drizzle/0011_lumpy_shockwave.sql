CREATE TABLE `conges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`artisanId` int NOT NULL,
	`type` enum('conge_paye','rtt','maladie','sans_solde','formation','autre') NOT NULL,
	`dateDebut` date NOT NULL,
	`dateFin` date NOT NULL,
	`demiJourneeDebut` boolean DEFAULT false,
	`demiJourneeFin` boolean DEFAULT false,
	`motif` text,
	`statut` enum('en_attente','approuve','refuse','annule') DEFAULT 'en_attente',
	`commentaireValidation` text,
	`dateValidation` timestamp,
	`validePar` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historique_ca` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`mois` int NOT NULL,
	`annee` int NOT NULL,
	`caTotal` decimal(12,2) DEFAULT '0.00',
	`nombreFactures` int DEFAULT 0,
	`nombreClients` int DEFAULT 0,
	`panierMoyen` decimal(10,2) DEFAULT '0.00',
	`tauxConversion` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historique_ca_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historique_notifications_push` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`type` enum('assignation','modification','annulation','rappel','message','avis') NOT NULL,
	`titre` varchar(100) NOT NULL,
	`corps` text,
	`referenceId` int,
	`referenceType` varchar(50),
	`statut` enum('envoye','echec','lu') DEFAULT 'envoye',
	`dateEnvoi` timestamp NOT NULL DEFAULT (now()),
	`dateLecture` timestamp,
	CONSTRAINT `historique_notifications_push_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `preferences_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`nouvelleAssignation` boolean DEFAULT true,
	`modificationIntervention` boolean DEFAULT true,
	`annulationIntervention` boolean DEFAULT true,
	`rappelIntervention` boolean DEFAULT true,
	`nouveauMessage` boolean DEFAULT true,
	`demandeAvis` boolean DEFAULT false,
	`heureDebutNotif` varchar(5) DEFAULT '08:00',
	`heureFinNotif` varchar(5) DEFAULT '20:00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `preferences_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `previsions_ca` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`mois` int NOT NULL,
	`annee` int NOT NULL,
	`caPrevisionnel` decimal(12,2) DEFAULT '0.00',
	`caRealise` decimal(12,2) DEFAULT '0.00',
	`ecart` decimal(12,2) DEFAULT '0.00',
	`ecartPourcentage` decimal(5,2) DEFAULT '0.00',
	`methodeCalcul` enum('moyenne_mobile','regression_lineaire','saisonnalite','manuel') DEFAULT 'moyenne_mobile',
	`confiance` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `previsions_ca_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`userAgent` varchar(255),
	`actif` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `soldes_conges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`artisanId` int NOT NULL,
	`type` enum('conge_paye','rtt') NOT NULL,
	`annee` int NOT NULL,
	`soldeInitial` decimal(5,2) DEFAULT '0.00',
	`soldeRestant` decimal(5,2) DEFAULT '0.00',
	`joursAcquis` decimal(5,2) DEFAULT '0.00',
	`joursPris` decimal(5,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `soldes_conges_id` PRIMARY KEY(`id`)
);
