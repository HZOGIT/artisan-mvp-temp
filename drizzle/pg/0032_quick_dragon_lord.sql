CREATE TYPE "public"."type_contrat" AS ENUM('cdi', 'cdd', 'interimaire', 'sous_traitant');--> statement-breakpoint
ALTER TABLE "techniciens" ADD COLUMN "typeContrat" "type_contrat";
