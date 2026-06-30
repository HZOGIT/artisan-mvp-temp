-- Aligner les valeurs du type ENUM paiement_statut avec le domaine PaiementStatut.
-- ALTER TYPE RENAME VALUE renomme en place : toutes les lignes existantes sont mises à jour atomiquement.
ALTER TYPE paiement_statut RENAME VALUE 'complete' TO 'payee';
ALTER TYPE paiement_statut RENAME VALUE 'echoue' TO 'echouee';
ALTER TYPE paiement_statut RENAME VALUE 'rembourse' TO 'remboursee';
