CREATE TYPE "public"."regime_tva" AS ENUM('encaissements', 'debits');--> statement-breakpoint
ALTER TABLE "configurations_comptables" ADD COLUMN "regimeTVA" "regime_tva" DEFAULT 'encaissements' NOT NULL;
