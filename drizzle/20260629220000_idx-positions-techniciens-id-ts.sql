-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_positions_techniciens_id_ts ON positions_techniciens("technicienId", "timestamp" DESC);
