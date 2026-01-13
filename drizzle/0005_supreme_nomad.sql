CREATE TABLE `commandes_fournisseurs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`fournisseurId` int NOT NULL,
	`reference` varchar(50),
	`dateCommande` timestamp NOT NULL DEFAULT (now()),
	`dateLivraisonPrevue` timestamp,
	`dateLivraisonReelle` timestamp,
	`statut` enum('en_attente','confirmee','expediee','livree','annulee') DEFAULT 'en_attente',
	`montantTotal` decimal(10,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commandes_fournisseurs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lignes_commandes_fournisseurs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`commandeId` int NOT NULL,
	`stockId` int,
	`designation` varchar(255) NOT NULL,
	`reference` varchar(50),
	`quantite` decimal(10,2) NOT NULL,
	`prixUnitaire` decimal(10,2),
	`montantTotal` decimal(10,2),
	CONSTRAINT `lignes_commandes_fournisseurs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modeles_email` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(100) NOT NULL,
	`type` enum('relance_devis','envoi_devis','envoi_facture','rappel_paiement','autre') NOT NULL,
	`sujet` varchar(255) NOT NULL,
	`contenu` text NOT NULL,
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `modeles_email_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paiements_stripe` (
	`id` int AUTO_INCREMENT NOT NULL,
	`factureId` int NOT NULL,
	`artisanId` int NOT NULL,
	`stripeSessionId` varchar(255),
	`stripePaymentIntentId` varchar(255),
	`montant` decimal(10,2) NOT NULL,
	`devise` varchar(3) DEFAULT 'EUR',
	`statut` enum('en_attente','complete','echoue','rembourse') DEFAULT 'en_attente',
	`lienPaiement` varchar(500),
	`tokenPaiement` varchar(64),
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paiements_stripe_id` PRIMARY KEY(`id`)
);
