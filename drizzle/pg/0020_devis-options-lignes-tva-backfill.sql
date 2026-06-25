UPDATE "devis_options_lignes" SET "tvaCategorieId" =
  CASE
    WHEN CAST("tauxTVA" AS numeric) >= 19.5 THEN 'FR_20'
    WHEN CAST("tauxTVA" AS numeric) >= 9.5  THEN 'FR_10'
    WHEN CAST("tauxTVA" AS numeric) >= 5.0  THEN 'FR_5_5'
    WHEN CAST("tauxTVA" AS numeric) >= 2.0  THEN 'FR_2_1'
    ELSE 'FR_EXONERE'
  END
WHERE "tvaCategorieId" IS NULL;