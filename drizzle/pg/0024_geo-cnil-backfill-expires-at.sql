-- Backfill CNIL : renseigne expiresAt sur les positions existantes (timestamp + 8h).
-- Les positions dont expiresAt < now() seront purgées au prochain tick du cron geo-purge.
UPDATE "positions_techniciens"
SET "expiresAt" = "timestamp" + INTERVAL '8 hours'
WHERE "expiresAt" IS NULL;