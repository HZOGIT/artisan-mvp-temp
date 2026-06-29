-- Correction des lignes de facture "Situation de travaux" avec taux TVA non légaux.
-- Ce script est IDEMPOTENT et doit être relu avant exécution sur prod (port 5433).
-- Exécuter en tant qu'artisan_user (DATABASE_URL), PAS app_tenant (pas de RLS owner).
--
-- Taux TVA légaux FR : 0.00, 2.10, 5.50, 10.00, 20.00
-- Root cause : calculerMontantSituation() reverse-calculait un taux composite depuis
-- totalHT/totalTTC du devis. Corrigé dans write-use-cases.ts (ventilation par groupe).

BEGIN;

-- 1) Audit : lignes situation à taux illégal (à afficher avant de committer).
SELECT
  fl.id,
  f.id AS facture_id,
  f.numero AS facture_numero,
  f.statut,
  f."artisanId",
  fl.designation,
  fl."tauxTVA",
  fl."montantHT",
  fl."montantTVA",
  fl."montantTTC"
FROM factures_lignes fl
JOIN factures f ON f.id = fl."factureId"
WHERE fl."tauxTVA" NOT IN ('0.00', '2.10', '5.50', '10.00', '20.00')
  AND fl.designation ILIKE 'Situation de travaux%';

-- 2) Fix spécifique : factures_lignes.id=37 (factureId=31, artisanId=1).
--    Devis source (id=36) : 4 000 HT @ 10% + 6 250 HT @ 20% → totalHT 10 250, totalTTC 11 900.
--    Situation 20% : objectif 2 380 TTC → HT 2 050 → ventilé 800 @ 10% + 1 250 @ 20%.
--    Ancienne ligne : tauxTVA=16.10 (illégal), montantTVA=330.05, montantTTC=2380.05.
--    Nouvelles lignes : TVA 80+250=330, TTC 880+1500=2380 (0.05 de moins → recalcul facture).

DELETE FROM factures_lignes WHERE id = 37;

INSERT INTO factures_lignes (
  "factureId", ordre, designation, quantite, unite,
  "prixUnitaireHT", "tauxTVA", remise, "tvaCategorieId",
  "montantHT", "montantTVA", "montantTTC", type
) VALUES
  (31, 1,
   'Situation de travaux — avancement 20 % — TVA 10.00 %',
   '1.00', 'unité', '800.00', '10.00', '0.00', 'FR_10',
   '800.00', '80.00', '880.00', 'produit'),
  (31, 2,
   'Situation de travaux — avancement 20 % — TVA 20.00 %',
   '1.00', 'unité', '1250.00', '20.00', '0.00', 'FR_20',
   '1250.00', '250.00', '1500.00', 'produit');

-- 3) Recalcul des totaux de la facture 31 depuis ses lignes.
UPDATE factures f
SET
  "totalHT"  = (SELECT COALESCE(SUM(fl."montantHT"),  0) FROM factures_lignes fl WHERE fl."factureId" = f.id),
  "totalTVA" = (SELECT COALESCE(SUM(fl."montantTVA"), 0) FROM factures_lignes fl WHERE fl."factureId" = f.id),
  "totalTTC" = (SELECT COALESCE(SUM(fl."montantTTC"), 0) FROM factures_lignes fl WHERE fl."factureId" = f.id)
WHERE id = 31;

-- 4) Vérification post-fix (affiche les valeurs recalculées).
SELECT id, numero, statut, "totalHT", "totalTVA", "totalTTC"
FROM factures WHERE id = 31;

-- Valider manuellement (ROLLBACK si doute, COMMIT si OK) :
-- COMMIT;
-- ROLLBACK;
