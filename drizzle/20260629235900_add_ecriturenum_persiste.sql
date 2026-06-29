-- Colonne ecritureNum : numéro de pièce permanent (arrêté du 29/07/2013 A47 A-1 LPF).
-- Nullable pour les écritures existantes (backfill one-shot séparé).
-- Assigné à la validation (brouillon → validee), immuable ensuite.

ALTER TABLE ecritures_comptables
  ADD COLUMN IF NOT EXISTS "ecritureNum" integer;

-- Index de performance pour MAX("ecritureNum") lors de l'attribution séquentielle.
-- Note : ecritureNum est un numéro de PIÈCE (plusieurs lignes/écriture partagent le même num)
-- → un UNIQUE sur (artisanId, ecritureNum) violerait immédiatement (ex. 3 lignes VE = num 1).
-- L'unicité inter-pièces est garantie par le MAX+1 dans la transaction de validation.
CREATE INDEX IF NOT EXISTS idx_ecritures_comptables_artisan_ecriturenum
  ON ecritures_comptables ("artisanId", "ecritureNum")
  WHERE "ecritureNum" IS NOT NULL;
