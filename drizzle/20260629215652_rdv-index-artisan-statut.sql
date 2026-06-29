-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rdv_artisan_statut ON rdv_en_ligne("artisanId", statut);
