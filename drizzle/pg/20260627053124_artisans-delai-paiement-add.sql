-- Ajouter les colonnes delaiPaiement* à artisans si absentes (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artisans' AND column_name = 'delaiPaiementJours'
  ) THEN
    ALTER TABLE "artisans" ADD COLUMN "delaiPaiementJours" integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artisans' AND column_name = 'delaiPaiementType'
  ) THEN
    ALTER TABLE "artisans" ADD COLUMN "delaiPaiementType" "delai_paiement_type" DEFAULT 'net';
  END IF;
END $$;--> statement-breakpoint
