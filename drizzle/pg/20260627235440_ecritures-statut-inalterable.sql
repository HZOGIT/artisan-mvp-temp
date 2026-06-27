CREATE TYPE "public"."ecriture_statut" AS ENUM('brouillon', 'validee');--> statement-breakpoint
ALTER TABLE "ecritures_comptables" ADD COLUMN "statut" "ecriture_statut" DEFAULT 'brouillon' NOT NULL;