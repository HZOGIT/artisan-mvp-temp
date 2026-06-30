-- Backfill owner permissions pour les artisans sans permissions_utilisateur.
-- Cause racine OPE-992 : la fenêtre 21:41–22:29 UTC du 2026-06-29 avait FORCE RLS actif
-- sur permissions_utilisateur — le INSERT best-effort échouait silencieusement.
-- Fix : INSERT atomique dans la tx principale (createAndBootstrapUser).
-- Ce backfill corrige les 4 comptes affectés (et tout futur compte en cas de régression).
-- artisan_user = bypass RLS ; pas de set_config nécessaire.
-- Idempotent via ON CONFLICT DO NOTHING.

INSERT INTO permissions_utilisateur ("userId", permission, autorise)
SELECT u.id, p.permission, true
FROM artisans a
JOIN users u ON u.id = a."userId"
CROSS JOIN (VALUES
  ('dashboard.voir'),
  ('statistiques.voir'),
  ('devis.voir'),
  ('devis.creer'),
  ('devis.supprimer'),
  ('factures.voir'),
  ('factures.creer'),
  ('factures.supprimer'),
  ('contrats.voir'),
  ('contrats.gerer'),
  ('relances.voir'),
  ('clients.voir'),
  ('clients.gerer'),
  ('chat.voir'),
  ('portail.gerer'),
  ('rdv.gerer'),
  ('interventions.voir'),
  ('interventions.gerer'),
  ('calendrier.voir'),
  ('conges.gerer'),
  ('chantiers.voir'),
  ('chantiers.gerer'),
  ('techniciens.voir'),
  ('techniciens.gerer'),
  ('geolocalisation.voir'),
  ('articles.voir'),
  ('comptabilite.voir'),
  ('exports.voir'),
  ('notes_frais.approuver'),
  ('integrations-comptables.configurer'),
  ('parametres.voir'),
  ('parametres.modifier'),
  ('utilisateurs.gerer'),
  ('vitrine.gerer')
) AS p(permission)
WHERE NOT EXISTS (
  SELECT 1 FROM permissions_utilisateur pu WHERE pu."userId" = u.id
)
ON CONFLICT ("userId", permission) DO NOTHING;
