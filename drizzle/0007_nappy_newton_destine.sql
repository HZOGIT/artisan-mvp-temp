CREATE TABLE `avis_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`interventionId` int,
	`note` int NOT NULL,
	`commentaire` text,
	`tokenAvis` varchar(64),
	`reponseArtisan` text,
	`reponseAt` timestamp,
	`statut` enum('en_attente','publie','masque') DEFAULT 'en_attente',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `avis_clients_id` PRIMARY KEY(`id`),
	CONSTRAINT `avis_clients_tokenAvis_unique` UNIQUE(`tokenAvis`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`sujet` varchar(255),
	`statut` enum('active','archivee') DEFAULT 'active',
	`dernierMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `demandes_avis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`interventionId` int NOT NULL,
	`tokenDemande` varchar(64) NOT NULL,
	`emailEnvoyeAt` timestamp,
	`avisRecuAt` timestamp,
	`statut` enum('envoyee','ouverte','completee','expiree') DEFAULT 'envoyee',
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `demandes_avis_id` PRIMARY KEY(`id`),
	CONSTRAINT `demandes_avis_tokenDemande_unique` UNIQUE(`tokenDemande`)
);
--> statement-breakpoint
CREATE TABLE `disponibilites_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`jourSemaine` int NOT NULL,
	`heureDebut` varchar(5) NOT NULL,
	`heureFin` varchar(5) NOT NULL,
	`disponible` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `disponibilites_techniciens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`expediteur` enum('artisan','client') NOT NULL,
	`contenu` text NOT NULL,
	`lu` boolean DEFAULT false,
	`luAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`prenom` varchar(255),
	`email` varchar(320),
	`telephone` varchar(20),
	`specialite` varchar(100),
	`couleur` varchar(7) DEFAULT '#3b82f6',
	`statut` enum('actif','inactif','conge') DEFAULT 'actif',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `techniciens_id` PRIMARY KEY(`id`)
);
