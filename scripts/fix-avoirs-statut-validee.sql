/*
 * One-shot : débloque les avoirs figés en statut 'validee' (cycle de vie brisé OPE-767).
 * À exécuter UNE SEULE FOIS sur la base déployée (5433).
 * Ne touche QUE les avoirs (typeDocument='avoir') en statut 'validee'.
 */

BEGIN;

SELECT id, "artisanId", numero, statut, "typeDocument", "createdAt"
FROM factures
WHERE "typeDocument" = 'avoir' AND statut = 'validee';

UPDATE factures
SET statut = 'brouillon', "updatedAt" = NOW()
WHERE "typeDocument" = 'avoir' AND statut = 'validee';

/*
 * Vérification post-update : doit retourner 0 ligne.
 */
SELECT COUNT(*) AS avoirs_encore_bloques
FROM factures
WHERE "typeDocument" = 'avoir' AND statut = 'validee';

COMMIT;
