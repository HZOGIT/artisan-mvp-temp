-- OPE-836 : CHECK quantiteEnStock >= 0 (defense-in-depth)
-- OPE-837 : FK mouvements_stock.stockId -> stocks.id ON DELETE CASCADE

-- Cleanup préventif (0 lignes attendues sur 5433, vérifiées avant déploiement)
DELETE FROM mouvements_stock
WHERE "stockId" NOT IN (SELECT id FROM stocks);

UPDATE stocks
SET "quantiteEnStock" = 0
WHERE "quantiteEnStock" < 0;

-- OPE-836 : contrainte non-négativité quantité
ALTER TABLE stocks
  ADD CONSTRAINT stocks_quantite_non_negative
  CHECK ("quantiteEnStock" >= 0);

-- OPE-837 : FK référentielle avec cascade (suppression stock -> mouvements supprimés)
ALTER TABLE mouvements_stock
  ADD CONSTRAINT mouvements_stock_stockid_fk
  FOREIGN KEY ("stockId") REFERENCES stocks(id) ON DELETE CASCADE;
