-- Colonne ecritureNum : numéro de pièce permanent (arrêté du 29/07/2013 A47 A-1 LPF).
-- Nullable pour les écritures existantes (backfill one-shot séparé).
-- Assigné à la validation (brouillon → validee), immuable ensuite.

ALTER TABLE ecritures_comptables
  ADD COLUMN IF NOT EXISTS "ecritureNum" integer;

-- Index pour MAX() en O(log n) lors de l'attribution séquentielle
CREATE INDEX IF NOT EXISTS idx_ecritures_comptables_artisan_ecriturenum
  ON ecritures_comptables ("artisanId", "ecritureNum")
  WHERE "ecritureNum" IS NOT NULL;
