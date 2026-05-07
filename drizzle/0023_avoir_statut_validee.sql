-- Ajout du statut "validee" pour les factures et avoirs
-- "validee" = document fiscal verrouillé mais pas encore envoyé
-- Utilisé notamment pour les avoirs qui sont verrouillés dès leur création
-- mais ne sont marqués "envoyee" qu'après envoi par email.

ALTER TABLE `factures`
  MODIFY COLUMN `statut` ENUM('brouillon', 'validee', 'envoyee', 'payee', 'en_retard', 'annulee') DEFAULT 'brouillon';
