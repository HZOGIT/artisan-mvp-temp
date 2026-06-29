-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_artisan_lu ON notifications("artisanId", lu, archived);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activites_artisan ON activites("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chantiers_client ON chantiers("clientId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_avis_clients_artisan ON avis_clients("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_avis_clients_client ON avis_clients("clientId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_demandes_avis_artisan ON demandes_avis("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_demandes_avis_client ON demandes_avis("clientId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stocks_artisan ON stocks("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mouvements_stock_stock ON mouvements_stock("stockId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_usage_artisan ON llm_usage("artisan_id");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_threads_artisan ON ai_threads("artisanId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_messages_thread ON ai_messages("threadId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_badges_techniciens_tech ON badges_techniciens("technicienId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conges_artisan_tech ON conges("artisanId", "technicienId");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deplacements_tech ON historique_deplacements("technicienId");
