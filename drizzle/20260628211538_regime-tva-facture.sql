DO $$ BEGIN
  CREATE TYPE "public"."regime_tva_facture" AS ENUM('normal', 'autoliquidation_btp', 'exonere');
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;--> statement-breakpoint
ALTER TABLE "factures" ADD COLUMN IF NOT EXISTS "regimeTVA" "regime_tva_facture" DEFAULT 'normal';
