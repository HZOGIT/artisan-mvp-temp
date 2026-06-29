-- FK manquante : ecritures_comptables."factureId" → factures.id (ON DELETE RESTRICT — inaltérabilité FEC)

ALTER TABLE ecritures_comptables
  ADD CONSTRAINT fk_ecritures_facture_id
  FOREIGN KEY ("factureId")
  REFERENCES factures(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_ecritures_comptables_facture_id
  ON ecritures_comptables("factureId");
