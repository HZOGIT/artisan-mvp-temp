CREATE TABLE `mouvements_stock` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stockId` int NOT NULL,
	`type` enum('entree','sortie','ajustement') NOT NULL,
	`quantite` decimal(10,2) NOT NULL,
	`quantiteAvant` decimal(10,2) NOT NULL,
	`quantiteApres` decimal(10,2) NOT NULL,
	`motif` text,
	`reference` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mouvements_stock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signatures_devis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devisId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`signatureData` text,
	`signataireName` varchar(255),
	`signataireEmail` varchar(320),
	`ipAddress` varchar(45),
	`userAgent` text,
	`signedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signatures_devis_id` PRIMARY KEY(`id`),
	CONSTRAINT `signatures_devis_devisId_unique` UNIQUE(`devisId`),
	CONSTRAINT `signatures_devis_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `stocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`articleId` int,
	`articleType` enum('bibliotheque','artisan') DEFAULT 'bibliotheque',
	`reference` varchar(50) NOT NULL,
	`designation` varchar(500) NOT NULL,
	`quantiteEnStock` decimal(10,2) DEFAULT '0.00',
	`seuilAlerte` decimal(10,2) DEFAULT '5.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixAchat` decimal(10,2),
	`emplacement` varchar(100),
	`fournisseur` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stocks_id` PRIMARY KEY(`id`)
);
