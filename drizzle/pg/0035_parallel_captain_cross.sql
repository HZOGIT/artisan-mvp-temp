ALTER TABLE "devis_options_lignes" ADD COLUMN "remise" numeric(5, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "modeles_devis_lignes" ADD COLUMN "remise" numeric(5, 2) DEFAULT '0.00';