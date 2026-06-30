/* Backfill : insère un mouvement initial 'entree' pour chaque stock ayant une quantité > 0
   sans aucun mouvement existant. Idempotent (NOT EXISTS). */
INSERT INTO mouvements_stock ("stockId", type, quantite, "quantiteAvant", "quantiteApres", motif)
SELECT
  id,
  'entree',
  "quantiteEnStock",
  '0.00',
  "quantiteEnStock",
  'Stock initial (backfill audit)'
FROM stocks
WHERE "quantiteEnStock"::numeric > 0
  AND NOT EXISTS (
    SELECT 1 FROM mouvements_stock m WHERE m."stockId" = stocks.id
  );
