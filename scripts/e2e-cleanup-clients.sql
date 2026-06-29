-- One-shot cleanup OPE-735 : supprime les clients E2E-% et leurs données liées (ids 13, 14)
-- Cible : DB déployée (port 5433)
-- Commande :
--   PGPASSWORD=artisan_password psql -h localhost -p 5433 -U artisan_user -d artisan_mvp -f scripts/e2e-cleanup-clients.sql
-- NE PAS EXÉCUTER EN CI / au démarrage — one-shot manuel.

BEGIN;

-- Contrôle : afficher les clients ciblés avant suppression
SELECT id, nom, email FROM clients WHERE nom LIKE 'E2E-%';

-- factures_cycle_vie_events référence factures avec ON DELETE no action → supprimer d'abord
DELETE FROM factures_cycle_vie_events
  WHERE "factureId" IN (
    SELECT id FROM factures
    WHERE "clientId" IN (SELECT id FROM clients WHERE nom LIKE 'E2E-%')
  );

-- factures_lignes (pas de FK vers factures déclarée, nettoyage préventif)
DELETE FROM factures_lignes
  WHERE "factureId" IN (
    SELECT id FROM factures
    WHERE "clientId" IN (SELECT id FROM clients WHERE nom LIKE 'E2E-%')
  );

-- factures (cascade : pa_outbox, reglements, pieces_jointes, attestations_tva)
DELETE FROM factures
  WHERE "clientId" IN (SELECT id FROM clients WHERE nom LIKE 'E2E-%');

-- clients E2E
DELETE FROM clients WHERE nom LIKE 'E2E-%';

-- Vérification post-suppression (doit renvoyer 0 lignes)
SELECT COUNT(*) AS clients_e2e_restants FROM clients WHERE nom LIKE 'E2E-%';

COMMIT;
