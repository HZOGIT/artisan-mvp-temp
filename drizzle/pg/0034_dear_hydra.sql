ALTER TABLE "devis_lignes" ADD COLUMN IF NOT EXISTS "remise" numeric(5, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "factures_lignes" ADD COLUMN "remise" numeric(5, 2) DEFAULT '0.00';
