ALTER TABLE `commandes_fournisseurs` ADD `statutFacturation` enum('a_facturer','facturee') DEFAULT 'a_facturer';--> statement-breakpoint
ALTER TABLE `commandes_fournisseurs` ADD `depenseId` int;