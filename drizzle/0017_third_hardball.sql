CREATE TABLE `modeles_devis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`description` text,
	`notes` text,
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modeles_devis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modeles_devis_lignes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modeleId` int NOT NULL,
	`articleId` int,
	`designation` varchar(255) NOT NULL,
	`description` text,
	`quantite` decimal(10,2) DEFAULT '1.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) DEFAULT '0.00',
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`remise` decimal(5,2) DEFAULT '0.00',
	`ordre` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `modeles_devis_lignes_id` PRIMARY KEY(`id`)
);
