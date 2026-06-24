INSERT INTO "tva_categories" ("id","taux","label","mention_legale","code_facturx","compte_collecte","ordre","actif") VALUES
  ('FR_20',  '20.00', '20 % — Taux normal',            NULL,                                    'S',  '44571', 1, true),
  ('FR_10',  '10.00', '10 % — Taux intermédiaire',      NULL,                                    'S',  '44572', 2, true),
  ('FR_5_5',  '5.50', '5,5 % — Rénovation énergétique', NULL,                                    'S',  '44573', 3, true),
  ('FR_2_1',  '2.10', '2,1 % — Taux particulier',       NULL,                                    'S',  '44574', 4, true),
  ('FR_FRANCHISE', '0.00', '0 % — Franchise en base',   'TVA non applicable, art. 293 B du CGI', 'E',  NULL,    5, true),
  ('FR_EXONERE',   '0.00', '0 % — Exonéré',              NULL,                                    'E',  NULL,    6, true),
  ('FR_AUTO',      '0.00', '0 % — Autoliquidation',      'Autoliquidation',                       'AE', NULL,    7, true)
ON CONFLICT ("id") DO NOTHING;

UPDATE "devis_lignes" SET "tvaCategorieId" = CASE
  WHEN "tauxTVA"::numeric = 20  THEN 'FR_20'
  WHEN "tauxTVA"::numeric = 10  THEN 'FR_10'
  WHEN "tauxTVA"::numeric = 5.5 THEN 'FR_5_5'
  WHEN "tauxTVA"::numeric = 2.1 THEN 'FR_2_1'
  WHEN "tauxTVA"::numeric = 0   THEN 'FR_EXONERE'
  ELSE 'FR_20'
END
WHERE "tvaCategorieId" IS NULL;

UPDATE "factures_lignes" SET "tvaCategorieId" = CASE
  WHEN "tauxTVA"::numeric = 20  THEN 'FR_20'
  WHEN "tauxTVA"::numeric = 10  THEN 'FR_10'
  WHEN "tauxTVA"::numeric = 5.5 THEN 'FR_5_5'
  WHEN "tauxTVA"::numeric = 2.1 THEN 'FR_2_1'
  WHEN "tauxTVA"::numeric = 0   THEN 'FR_EXONERE'
  ELSE 'FR_20'
END
WHERE "tvaCategorieId" IS NULL;