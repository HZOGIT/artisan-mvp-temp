-- Dev seed: dev@operioz.com / Azerqsdf1234! — Operioz
SET @email = 'dev@operioz.com';
SET @hash  = '$2b$10$sptAWD6AmzrdTNG1MUtJUOludLqloK.1y5b8DUjgwFqm8W6Nw7lTq';

INSERT INTO users (name, prenom, email, password, loginMethod, role, actif, lastSignedIn)
VALUES ('Ismael', 'Ismael', @email, @hash, 'email', 'artisan', 1, NOW())
ON DUPLICATE KEY UPDATE
  password    = @hash,
  actif       = 1,
  updatedAt   = NOW();

SET @userId = (SELECT id FROM users WHERE email = @email);

INSERT INTO artisans (userId, nomEntreprise, email, specialite)
VALUES (@userId, 'Operioz', @email, 'multi-services')
ON DUPLICATE KEY UPDATE
  nomEntreprise = 'Operioz',
  updatedAt     = NOW();

SET @artisanId = (SELECT id FROM artisans WHERE userId = @userId);

UPDATE users SET artisanId = @artisanId WHERE id = @userId;

SET @artisanId2 = (SELECT id FROM artisans WHERE userId = @userId);

INSERT INTO subscriptions
  (artisan_id, plan, status, trial_ends_at, current_period_start, current_period_end,
   max_users, max_devices_per_user, max_concurrent_sessions)
VALUES
  (@artisanId2, 'trial', 'trialing',
   DATE_ADD(NOW(), INTERVAL 365 DAY), NOW(), DATE_ADD(NOW(), INTERVAL 365 DAY),
   999, 999, 999)
ON DUPLICATE KEY UPDATE
  status       = 'trialing',
  trial_ends_at = DATE_ADD(NOW(), INTERVAL 365 DAY),
  current_period_end = DATE_ADD(NOW(), INTERVAL 365 DAY),
  -- Dev user: no device/session ceiling so we can log in from many devices.
  max_users    = 999,
  max_devices_per_user = 999,
  max_concurrent_sessions = 999;

-- Seed permissions for the artisan role (all permissions except utilisateurs.gerer)
INSERT INTO permissions_utilisateur (userId, permission, autorise)
SELECT @userId, p, 1 FROM (
  SELECT 'dashboard.voir'        AS p UNION ALL
  SELECT 'statistiques.voir'     UNION ALL
  SELECT 'devis.voir'            UNION ALL
  SELECT 'devis.creer'           UNION ALL
  SELECT 'devis.supprimer'       UNION ALL
  SELECT 'factures.voir'         UNION ALL
  SELECT 'factures.creer'        UNION ALL
  SELECT 'factures.supprimer'    UNION ALL
  SELECT 'contrats.voir'         UNION ALL
  SELECT 'contrats.gerer'        UNION ALL
  SELECT 'relances.voir'         UNION ALL
  SELECT 'clients.voir'          UNION ALL
  SELECT 'clients.gerer'         UNION ALL
  SELECT 'chat.voir'             UNION ALL
  SELECT 'portail.gerer'         UNION ALL
  SELECT 'rdv.gerer'             UNION ALL
  SELECT 'interventions.voir'    UNION ALL
  SELECT 'interventions.gerer'   UNION ALL
  SELECT 'calendrier.voir'       UNION ALL
  SELECT 'chantiers.voir'        UNION ALL
  SELECT 'chantiers.gerer'       UNION ALL
  SELECT 'techniciens.voir'      UNION ALL
  SELECT 'geolocalisation.voir'  UNION ALL
  SELECT 'articles.voir'         UNION ALL
  SELECT 'comptabilite.voir'     UNION ALL
  SELECT 'exports.voir'          UNION ALL
  SELECT 'parametres.voir'       UNION ALL
  SELECT 'vitrine.gerer'
) perms
ON DUPLICATE KEY UPDATE autorise = 1;

SELECT u.id, u.email, u.role, u.actif, a.nomEntreprise, s.status as sub_status, s.trial_ends_at,
       (SELECT COUNT(*) FROM permissions_utilisateur WHERE userId = u.id) as nb_permissions
FROM users u
JOIN artisans a ON a.userId = u.id
LEFT JOIN subscriptions s ON s.artisan_id = a.id
WHERE u.email = @email;
