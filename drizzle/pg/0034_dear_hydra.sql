CREATE TYPE "public"."type_contrat" AS ENUM('cdi', 'cdd', 'interimaire', 'sous_traitant');--> statement-breakpoint
ALTER TABLE "artisans" ADD COLUMN "pendingDeletionAt" timestamp;--> statement-breakpoint
ALTER TABLE "devis_lignes" ADD COLUMN IF NOT EXISTS "remise" numeric(5, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "factures_lignes" ADD COLUMN "remise" numeric(5, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "techniciens" ADD COLUMN "typeContrat" "type_contrat";--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_billing_cycle_id_unique" UNIQUE("billing_cycle_id");