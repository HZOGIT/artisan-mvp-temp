-- Nettoyage one-shot des orphelins clientId=5 sur la BDD déployée (5433)
-- À exécuter MANUELLEMENT sur 5433 après validation en staging.
-- NE PAS committer de version exécutée automatiquement ni de migration.
--
-- Vérification préalable : le client id=5 ne doit plus exister
SELECT id, nom FROM clients WHERE id = 5;
-- Résultat attendu : 0 ligne (client supprimé)

-- Vérification des orphelins
SELECT id, "clientId", statut, titre FROM rdv_en_ligne WHERE "clientId" = 5;
SELECT id, "clientId", statut, titre FROM interventions WHERE "clientId" = 5;

-- Annuler le RDV orphelin (id=2, clientId=5, statut=confirme)
-- Garde : NOT EXISTS pour éviter d'annuler si le client existe encore
UPDATE rdv_en_ligne
SET statut = 'annule', "updatedAt" = now()
WHERE id = 2
  AND "clientId" = 5
  AND NOT EXISTS (SELECT 1 FROM clients WHERE id = 5);

-- Annuler les interventions orphelines (ids 1 et 3, clientId=5, statut=planifiee)
-- demandes_avis ON DELETE CASCADE → nettoyé automatiquement
UPDATE interventions
SET statut = 'annulee', "updatedAt" = now()
WHERE id IN (1, 3)
  AND "clientId" = 5
  AND NOT EXISTS (SELECT 1 FROM clients WHERE id = 5);

-- Vérification post-cleanup : 0 orphelin restant en statut actif
SELECT id, "clientId", statut FROM rdv_en_ligne WHERE "clientId" = 5 AND statut NOT IN ('annule', 'refuse');
SELECT id, "clientId", statut FROM interventions WHERE "clientId" = 5 AND statut NOT IN ('annulee');
