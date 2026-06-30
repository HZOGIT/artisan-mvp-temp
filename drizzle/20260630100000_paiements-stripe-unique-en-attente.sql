/* ponytail: index partiel UNIQUE — DB-level atomicity sur (factureId, artisanId) en_attente.
   Remplace le check applicatif non-atomique par une contrainte dure côté PG.
   Le runner maison applique ce .sql par ordre de nom de fichier (Option D). */
CREATE UNIQUE INDEX IF NOT EXISTS idx_paiements_stripe_facture_en_attente
  ON paiements_stripe ("factureId", "artisanId")
  WHERE statut = 'en_attente';
