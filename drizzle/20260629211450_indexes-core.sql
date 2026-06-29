-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devis_artisan ON devis("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devis_client ON devis("clientId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devis_lignes_devis ON devis_lignes("devisId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_factures_artisan ON factures("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_factures_client ON factures("clientId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_factures_devis ON factures("devisId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_factures_lignes_facture ON factures_lignes("factureId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_artisan ON clients("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interventions_artisan ON interventions("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interventions_client ON interventions("clientId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chantiers_artisan ON chantiers("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fournisseurs_artisan ON fournisseurs("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commandes_fournisseurs_artisan ON commandes_fournisseurs("artisanId");
