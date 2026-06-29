-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devis_options_devis ON devis_options("devisId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devis_options_lignes_option ON devis_options_lignes("optionId");
