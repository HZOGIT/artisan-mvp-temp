ALTER TABLE "parametres_artisan" ADD COLUMN IF NOT EXISTS "tauxIndemniteKm" numeric(6,3);
--> statement-breakpoint
ALTER TABLE "historique_deplacements" ADD COLUMN IF NOT EXISTS "depenseId" integer REFERENCES depenses(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_historique_deplacements_depense_id" ON "historique_deplacements" ("depenseId") WHERE "depenseId" IS NOT NULL;