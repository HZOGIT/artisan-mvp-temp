CREATE TABLE `executions_rapports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rapportId` int NOT NULL,
	`artisanId` int NOT NULL,
	`dateExecution` timestamp NOT NULL DEFAULT (now()),
	`parametres` json,
	`resultats` json,
	`nombreLignes` int DEFAULT 0,
	`tempsExecution` int,
	CONSTRAINT `executions_rapports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rapports_personnalises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(100) NOT NULL,
	`description` text,
	`type` enum('ventes','clients','interventions','stocks','fournisseurs','techniciens','financier') NOT NULL,
	`filtres` json,
	`colonnes` json,
	`groupement` varchar(50),
	`tri` varchar(50),
	`format` enum('tableau','graphique','liste') DEFAULT 'tableau',
	`graphiqueType` enum('bar','line','pie','doughnut'),
	`favori` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rapports_personnalises_id` PRIMARY KEY(`id`)
);
