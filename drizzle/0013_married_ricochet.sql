ALTER TABLE `parametres_artisan` ADD `delaiPaiementJours` int;--> statement-breakpoint
ALTER TABLE `parametres_artisan` ADD `delaiPaiementType` enum('net','fin_de_mois') DEFAULT 'net';