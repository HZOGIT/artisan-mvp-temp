-- Déduplique les doublons existants (garde le plus ancien par userId+permission),
-- puis pose la contrainte UNIQUE pour permettre l'upsert idempotent au bootstrap.

DELETE FROM permissions_utilisateur
WHERE id NOT IN (
  SELECT MIN(id)
  FROM permissions_utilisateur
  GROUP BY "userId", permission
);

ALTER TABLE permissions_utilisateur
  ADD CONSTRAINT permissions_utilisateur_userid_permission_unique
  UNIQUE ("userId", permission);
