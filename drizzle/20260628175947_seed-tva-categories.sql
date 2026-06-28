INSERT INTO "tva_categories" ("id", "taux", "label", "mention_legale", "code_facturx", "compte_collecte", "ordre", "actif")
VALUES
  ('FR_20',       20.00, '20 % — Taux normal',              NULL,                                              'S',  '445711', 1, true),
  ('FR_10',       10.00, '10 % — Taux intermédiaire',       NULL,                                              'AA', '445712', 2, true),
  ('FR_5_5',       5.50, '5,5 % — Rénovation énergétique',  NULL,                                              'AA', '445713', 3, true),
  ('FR_2_1',       2.10, '2,1 % — Taux particulier',        NULL,                                              'AA', '445714', 4, true),
  ('FR_FRANCHISE', 0.00, '0 % — Franchise en base',         'TVA non applicable, art. 293 B du CGI',           'Z',  NULL,     5, true),
  ('FR_EXONERE',   0.00, '0 % — Exonéré',                   NULL,                                              'E',  NULL,     6, true),
  ('FR_AUTO',      0.00, '0 % — Autoliquidation',           'Autoliquidation de la TVA par le preneur',        'AE', NULL,     7, true)
ON CONFLICT ("id") DO NOTHING;