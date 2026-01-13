CREATE TABLE `articles_fournisseurs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`articleId` int NOT NULL,
	`fournisseurId` int NOT NULL,
	`referenceExterne` varchar(100),
	`prixAchat` decimal(10,2),
	`delaiLivraison` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `articles_fournisseurs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fournisseurs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`contact` varchar(255),
	`email` varchar(320),
	`telephone` varchar(20),
	`adresse` text,
	`codePostal` varchar(10),
	`ville` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fournisseurs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sms_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`signatureId` int NOT NULL,
	`telephone` varchar(20) NOT NULL,
	`code` varchar(6) NOT NULL,
	`verified` boolean DEFAULT false,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sms_verifications_id` PRIMARY KEY(`id`)
);
