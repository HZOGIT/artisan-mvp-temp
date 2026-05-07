-- Conformité facturation française (article 286 CGI)
-- Ajout type de document (facture/avoir), référence facture d'origine, journal d'audit

-- Ajouter les colonnes typeDocument et factureOrigineId à la table factures
ALTER TABLE `factures` ADD COLUMN `typeDocument` ENUM('facture', 'avoir') DEFAULT 'facture';
ALTER TABLE `factures` ADD COLUMN `factureOrigineId` INT DEFAULT NULL;

-- Ajouter les colonnes prefixeAvoir et compteurAvoir à parametres_artisan
ALTER TABLE `parametres_artisan` ADD COLUMN `prefixeAvoir` VARCHAR(10) DEFAULT 'AV';
ALTER TABLE `parametres_artisan` ADD COLUMN `compteurAvoir` INT DEFAULT 1;

-- Créer la table audit_log (append-only, conformité fiscale)
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `artisanId` INT NOT NULL,
  `userId` INT NOT NULL,
  `entityType` VARCHAR(50) NOT NULL,
  `entityId` INT NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `details` TEXT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
