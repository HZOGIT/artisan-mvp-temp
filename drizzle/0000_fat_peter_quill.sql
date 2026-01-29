CREATE TABLE `analyses_photos_chantier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int,
	`titre` varchar(255),
	`description` text,
	`statut` enum('en_attente','en_cours','termine','erreur') DEFAULT 'en_attente',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analyses_photos_chantier_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `articles_artisan` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`reference` varchar(50) NOT NULL,
	`designation` varchar(500) NOT NULL,
	`description` text,
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) NOT NULL,
	`categorie` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `articles_artisan_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `articles_fournisseurs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`articleId` int NOT NULL,
	`fournisseurId` int NOT NULL,
	`referenceExterne` varchar(100),
	`prixAchat` decimal(10,2),
	`delaiLivraison` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `articles_fournisseurs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `artisans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`siret` varchar(14),
	`nomEntreprise` varchar(255),
	`adresse` text,
	`codePostal` varchar(10),
	`ville` varchar(100),
	`telephone` varchar(20),
	`email` varchar(320),
	`specialite` enum('plomberie','electricite','chauffage','multi-services') DEFAULT 'plomberie',
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`logo` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `artisans_id` PRIMARY KEY(`id`),
	CONSTRAINT `artisans_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `assurances_vehicules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehiculeId` int NOT NULL,
	`compagnie` varchar(255) NOT NULL,
	`numeroContrat` varchar(100),
	`typeAssurance` enum('tiers','tiers_plus','tous_risques') DEFAULT 'tiers',
	`dateDebut` date NOT NULL,
	`dateFin` date NOT NULL,
	`primeAnnuelle` decimal(10,2),
	`franchise` decimal(10,2),
	`document` text,
	`alerteEnvoyee` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assurances_vehicules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `avis_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`interventionId` int,
	`note` int NOT NULL,
	`commentaire` text,
	`tokenAvis` varchar(64),
	`reponseArtisan` text,
	`reponseAt` timestamp,
	`statut` enum('en_attente','publie','masque') DEFAULT 'en_attente',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `avis_clients_id` PRIMARY KEY(`id`),
	CONSTRAINT `avis_clients_tokenAvis_unique` UNIQUE(`tokenAvis`)
);
--> statement-breakpoint
CREATE TABLE `badges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`code` varchar(50) NOT NULL,
	`nom` varchar(100) NOT NULL,
	`description` text,
	`icone` varchar(50),
	`couleur` varchar(20),
	`categorie` enum('interventions','avis','ca','anciennete','special') DEFAULT 'interventions',
	`condition` text,
	`seuil` int,
	`points` int DEFAULT 10,
	`actif` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `badges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `badges_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`badgeId` int NOT NULL,
	`dateObtention` timestamp NOT NULL DEFAULT (now()),
	`valeurAtteinte` int,
	`notifie` boolean DEFAULT false,
	CONSTRAINT `badges_techniciens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bibliotheque_articles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reference` varchar(50) NOT NULL,
	`designation` varchar(500) NOT NULL,
	`description` text,
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) NOT NULL,
	`categorie` varchar(100),
	`sousCategorie` varchar(100),
	`metier` enum('plomberie','electricite','chauffage','general') DEFAULT 'general',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bibliotheque_articles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chantiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`reference` varchar(50) NOT NULL,
	`nom` varchar(255) NOT NULL,
	`description` text,
	`adresse` text,
	`codePostal` varchar(10),
	`ville` varchar(100),
	`dateDebut` date,
	`dateFinPrevue` date,
	`dateFinReelle` date,
	`budgetPrevisionnel` decimal(12,2),
	`budgetRealise` decimal(12,2) DEFAULT '0.00',
	`statut` enum('planifie','en_cours','en_pause','termine','annule') DEFAULT 'planifie',
	`avancement` int DEFAULT 0,
	`priorite` enum('basse','normale','haute','urgente') DEFAULT 'normale',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chantiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classement_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`artisanId` int NOT NULL,
	`periode` enum('semaine','mois','trimestre','annee') NOT NULL,
	`dateDebut` date NOT NULL,
	`dateFin` date NOT NULL,
	`rang` int NOT NULL,
	`pointsTotal` int DEFAULT 0,
	`interventions` int DEFAULT 0,
	`ca` decimal(10,2) DEFAULT '0.00',
	`noteMoyenne` decimal(3,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classement_techniciens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_portal_access` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`artisanId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`lastAccessAt` timestamp,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_portal_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_portal_access_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `client_portal_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`sessionToken` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`userAgent` text,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_portal_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_portal_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`prenom` varchar(255),
	`email` varchar(320),
	`telephone` varchar(20),
	`adresse` text,
	`codePostal` varchar(10),
	`ville` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commandes_fournisseurs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`fournisseurId` int NOT NULL,
	`reference` varchar(50),
	`dateCommande` timestamp NOT NULL DEFAULT (now()),
	`dateLivraisonPrevue` timestamp,
	`dateLivraisonReelle` timestamp,
	`statut` enum('en_attente','confirmee','expediee','livree','annulee') DEFAULT 'en_attente',
	`montantTotal` decimal(10,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commandes_fournisseurs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_alertes_previsions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`seuilAlertePositif` decimal(5,2) DEFAULT '10.00',
	`seuilAlerteNegatif` decimal(5,2) DEFAULT '10.00',
	`alerteEmail` boolean DEFAULT true,
	`alerteSms` boolean DEFAULT false,
	`emailDestination` varchar(320),
	`telephoneDestination` varchar(20),
	`frequenceVerification` enum('quotidien','hebdomadaire','mensuel') DEFAULT 'hebdomadaire',
	`actif` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `config_alertes_previsions_id` PRIMARY KEY(`id`),
	CONSTRAINT `config_alertes_previsions_artisanId_unique` UNIQUE(`artisanId`)
);
--> statement-breakpoint
CREATE TABLE `config_relances_auto` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`actif` boolean DEFAULT false,
	`joursApresEnvoi` int DEFAULT 7,
	`joursEntreRelances` int DEFAULT 7,
	`nombreMaxRelances` int DEFAULT 3,
	`heureEnvoi` varchar(5) DEFAULT '09:00',
	`joursEnvoi` varchar(50) DEFAULT '1,2,3,4,5',
	`modeleEmailId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `config_relances_auto_id` PRIMARY KEY(`id`),
	CONSTRAINT `config_relances_auto_artisanId_unique` UNIQUE(`artisanId`)
);
--> statement-breakpoint
CREATE TABLE `configurations_comptables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`logiciel` enum('sage','quickbooks','ciel','ebp','autre') DEFAULT 'sage',
	`formatExport` enum('fec','iif','qbo','csv') DEFAULT 'fec',
	`compteVentes` varchar(20) DEFAULT '706000',
	`compteTVACollectee` varchar(20) DEFAULT '445710',
	`compteClients` varchar(20) DEFAULT '411000',
	`compteAchats` varchar(20) DEFAULT '607000',
	`compteTVADeductible` varchar(20) DEFAULT '445660',
	`compteFournisseurs` varchar(20) DEFAULT '401000',
	`compteBanque` varchar(20) DEFAULT '512000',
	`compteCaisse` varchar(20) DEFAULT '530000',
	`journalVentes` varchar(10) DEFAULT 'VE',
	`journalAchats` varchar(10) DEFAULT 'AC',
	`journalBanque` varchar(10) DEFAULT 'BQ',
	`prefixeFacture` varchar(10) DEFAULT 'FA',
	`prefixeAvoir` varchar(10) DEFAULT 'AV',
	`exerciceDebut` int DEFAULT 1,
	`actif` boolean DEFAULT true,
	`syncAutoFactures` boolean DEFAULT false,
	`syncAutoPaiements` boolean DEFAULT false,
	`frequenceSync` enum('quotidien','hebdomadaire','mensuel','manuel') DEFAULT 'manuel',
	`heureSync` varchar(5) DEFAULT '02:00',
	`notifierErreurs` boolean DEFAULT true,
	`notifierSucces` boolean DEFAULT false,
	`derniereSync` timestamp,
	`prochainSync` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `configurations_comptables_id` PRIMARY KEY(`id`),
	CONSTRAINT `configurations_comptables_artisanId_unique` UNIQUE(`artisanId`)
);
--> statement-breakpoint
CREATE TABLE `conges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`artisanId` int NOT NULL,
	`type` enum('conge_paye','rtt','maladie','sans_solde','formation','autre') NOT NULL,
	`dateDebut` date NOT NULL,
	`dateFin` date NOT NULL,
	`demiJourneeDebut` boolean DEFAULT false,
	`demiJourneeFin` boolean DEFAULT false,
	`motif` text,
	`statut` enum('en_attente','approuve','refuse','annule') DEFAULT 'en_attente',
	`commentaireValidation` text,
	`dateValidation` timestamp,
	`validePar` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contrats_maintenance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`reference` varchar(50) NOT NULL,
	`titre` varchar(255) NOT NULL,
	`description` text,
	`montantHT` decimal(10,2) NOT NULL,
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`periodicite` enum('mensuel','trimestriel','semestriel','annuel') NOT NULL,
	`dateDebut` timestamp NOT NULL,
	`dateFin` timestamp,
	`prochainFacturation` timestamp,
	`statut` enum('actif','suspendu','termine','annule') DEFAULT 'actif',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contrats_maintenance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`sujet` varchar(255),
	`statut` enum('active','archivee') DEFAULT 'active',
	`dernierMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `demandes_avis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`interventionId` int NOT NULL,
	`tokenDemande` varchar(64) NOT NULL,
	`emailEnvoyeAt` timestamp,
	`avisRecuAt` timestamp,
	`statut` enum('envoyee','ouverte','completee','expiree') DEFAULT 'envoyee',
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `demandes_avis_id` PRIMARY KEY(`id`),
	CONSTRAINT `demandes_avis_tokenDemande_unique` UNIQUE(`tokenDemande`)
);
--> statement-breakpoint
CREATE TABLE `devis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`numero` varchar(50) NOT NULL,
	`dateDevis` timestamp NOT NULL DEFAULT (now()),
	`dateValidite` timestamp,
	`statut` enum('brouillon','envoye','accepte','refuse','expire') DEFAULT 'brouillon',
	`objet` text,
	`conditionsPaiement` text,
	`notes` text,
	`totalHT` decimal(10,2) DEFAULT '0.00',
	`totalTVA` decimal(10,2) DEFAULT '0.00',
	`totalTTC` decimal(10,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devis_genere_ia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analyseId` int NOT NULL,
	`devisId` int,
	`montantEstime` decimal(12,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `devis_genere_ia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devis_lignes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devisId` int NOT NULL,
	`ordre` int DEFAULT 0,
	`reference` varchar(50),
	`designation` varchar(500) NOT NULL,
	`description` text,
	`quantite` decimal(10,2) DEFAULT '1.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) NOT NULL,
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`montantHT` decimal(10,2) DEFAULT '0.00',
	`montantTVA` decimal(10,2) DEFAULT '0.00',
	`montantTTC` decimal(10,2) DEFAULT '0.00',
	CONSTRAINT `devis_lignes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devis_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devisId` int NOT NULL,
	`nom` varchar(100) NOT NULL,
	`description` text,
	`ordre` int DEFAULT 1,
	`totalHT` decimal(10,2) DEFAULT '0.00',
	`totalTVA` decimal(10,2) DEFAULT '0.00',
	`totalTTC` decimal(10,2) DEFAULT '0.00',
	`recommandee` boolean DEFAULT false,
	`selectionnee` boolean DEFAULT false,
	`dateSelection` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devis_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devis_options_lignes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`optionId` int NOT NULL,
	`articleId` int,
	`designation` varchar(255) NOT NULL,
	`description` text,
	`quantite` decimal(10,2) DEFAULT '1.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) DEFAULT '0.00',
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`remise` decimal(5,2) DEFAULT '0.00',
	`montantHT` decimal(10,2) DEFAULT '0.00',
	`montantTVA` decimal(10,2) DEFAULT '0.00',
	`montantTTC` decimal(10,2) DEFAULT '0.00',
	`ordre` int DEFAULT 1,
	CONSTRAINT `devis_options_lignes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `disponibilites_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`jourSemaine` int NOT NULL,
	`heureDebut` varchar(5) NOT NULL,
	`heureFin` varchar(5) NOT NULL,
	`disponible` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `disponibilites_techniciens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents_chantier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chantierId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`type` enum('plan','photo','permis','contrat','facture','autre') DEFAULT 'autre',
	`url` text NOT NULL,
	`taille` int,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_chantier_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ecritures_comptables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`dateEcriture` timestamp NOT NULL,
	`journal` enum('VE','AC','BQ','OD') NOT NULL,
	`numeroCompte` varchar(10) NOT NULL,
	`libelleCompte` varchar(100),
	`libelle` varchar(255) NOT NULL,
	`pieceRef` varchar(50),
	`debit` decimal(12,2) DEFAULT '0.00',
	`credit` decimal(12,2) DEFAULT '0.00',
	`factureId` int,
	`lettrage` varchar(10),
	`pointage` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ecritures_comptables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entretiens_vehicules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehiculeId` int NOT NULL,
	`type` enum('vidange','pneus','freins','controle_technique','revision','reparation','autre') NOT NULL,
	`dateEntretien` date NOT NULL,
	`kilometrageEntretien` int,
	`cout` decimal(10,2),
	`prestataire` varchar(255),
	`description` text,
	`prochainEntretienKm` int,
	`prochainEntretienDate` date,
	`facture` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entretiens_vehicules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `executions_rapports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rapportId` int NOT NULL,
	`artisanId` int NOT NULL,
	`dateExecution` timestamp NOT NULL DEFAULT (now()),
	`parametres` json,
	`resultats` json,
	`nombreLignes` int DEFAULT 0,
	`tempsExecution` int,
	CONSTRAINT `executions_rapports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exports_comptables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`logiciel` enum('sage','quickbooks','ciel','ebp','autre') NOT NULL,
	`formatExport` enum('fec','iif','qbo','csv') NOT NULL,
	`periodeDebut` date NOT NULL,
	`periodeFin` date NOT NULL,
	`nombreEcritures` int DEFAULT 0,
	`montantTotal` decimal(12,2),
	`fichierUrl` text,
	`statut` enum('en_cours','termine','erreur') DEFAULT 'en_cours',
	`erreur` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exports_comptables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `factures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`devisId` int,
	`numero` varchar(50) NOT NULL,
	`dateFacture` timestamp NOT NULL DEFAULT (now()),
	`dateEcheance` timestamp,
	`statut` enum('brouillon','envoyee','payee','en_retard','annulee') DEFAULT 'brouillon',
	`objet` text,
	`conditionsPaiement` text,
	`notes` text,
	`totalHT` decimal(10,2) DEFAULT '0.00',
	`totalTVA` decimal(10,2) DEFAULT '0.00',
	`totalTTC` decimal(10,2) DEFAULT '0.00',
	`montantPaye` decimal(10,2) DEFAULT '0.00',
	`datePaiement` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `factures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `factures_lignes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`factureId` int NOT NULL,
	`ordre` int DEFAULT 0,
	`reference` varchar(50),
	`designation` varchar(500) NOT NULL,
	`description` text,
	`quantite` decimal(10,2) DEFAULT '1.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) NOT NULL,
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`montantHT` decimal(10,2) DEFAULT '0.00',
	`montantTVA` decimal(10,2) DEFAULT '0.00',
	`montantTTC` decimal(10,2) DEFAULT '0.00',
	CONSTRAINT `factures_lignes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `factures_recurrentes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contratId` int NOT NULL,
	`factureId` int NOT NULL,
	`periodeDebut` timestamp NOT NULL,
	`periodeFin` timestamp NOT NULL,
	`genereeAutomatiquement` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `factures_recurrentes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fournisseurs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`contact` varchar(255),
	`email` varchar(320),
	`telephone` varchar(20),
	`adresse` text,
	`codePostal` varchar(10),
	`ville` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fournisseurs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historique_alertes_previsions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`mois` int NOT NULL,
	`annee` int NOT NULL,
	`typeAlerte` enum('depassement_positif','depassement_negatif') NOT NULL,
	`caPrevisionnel` decimal(12,2),
	`caRealise` decimal(12,2),
	`ecartPourcentage` decimal(5,2),
	`canalEnvoi` enum('email','sms','les_deux') NOT NULL,
	`dateEnvoi` timestamp NOT NULL DEFAULT (now()),
	`statut` enum('envoye','echec','lu') DEFAULT 'envoye',
	`message` text,
	CONSTRAINT `historique_alertes_previsions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historique_ca` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`mois` int NOT NULL,
	`annee` int NOT NULL,
	`caTotal` decimal(12,2) DEFAULT '0.00',
	`nombreFactures` int DEFAULT 0,
	`nombreClients` int DEFAULT 0,
	`panierMoyen` decimal(10,2) DEFAULT '0.00',
	`tauxConversion` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historique_ca_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historique_deplacements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`interventionId` int,
	`dateDebut` timestamp NOT NULL,
	`dateFin` timestamp,
	`distanceKm` decimal(8,2),
	`dureeMinutes` int,
	`latitudeDepart` decimal(10,8),
	`longitudeDepart` decimal(11,8),
	`latitudeArrivee` decimal(10,8),
	`longitudeArrivee` decimal(11,8),
	`adresseDepart` text,
	`adresseArrivee` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historique_deplacements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historique_kilometrage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehiculeId` int NOT NULL,
	`technicienId` int,
	`kilometrage` int NOT NULL,
	`dateReleve` date NOT NULL,
	`motif` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historique_kilometrage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historique_notifications_push` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`type` enum('assignation','modification','annulation','rappel','message','avis') NOT NULL,
	`titre` varchar(100) NOT NULL,
	`corps` text,
	`referenceId` int,
	`referenceType` varchar(50),
	`statut` enum('envoye','echec','lu') DEFAULT 'envoye',
	`dateEnvoi` timestamp NOT NULL DEFAULT (now()),
	`dateLecture` timestamp,
	CONSTRAINT `historique_notifications_push_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interventions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`clientId` int NOT NULL,
	`titre` varchar(255) NOT NULL,
	`description` text,
	`dateDebut` timestamp NOT NULL,
	`dateFin` timestamp,
	`statut` enum('planifiee','en_cours','terminee','annulee') DEFAULT 'planifiee',
	`adresse` text,
	`notes` text,
	`devisId` int,
	`factureId` int,
	`technicienId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `interventions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interventions_chantier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chantierId` int NOT NULL,
	`interventionId` int NOT NULL,
	`phaseId` int,
	`ordre` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interventions_chantier_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interventions_mobile` (
	`id` int AUTO_INCREMENT NOT NULL,
	`interventionId` int NOT NULL,
	`artisanId` int NOT NULL,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`heureArrivee` timestamp,
	`heureDepart` timestamp,
	`notesIntervention` text,
	`signatureClient` text,
	`signatureDate` timestamp,
	`syncStatus` enum('synced','pending','error') DEFAULT 'synced',
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interventions_mobile_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lignes_commandes_fournisseurs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`commandeId` int NOT NULL,
	`stockId` int,
	`designation` varchar(255) NOT NULL,
	`reference` varchar(50),
	`quantite` decimal(10,2) NOT NULL,
	`prixUnitaire` decimal(10,2),
	`montantTotal` decimal(10,2),
	CONSTRAINT `lignes_commandes_fournisseurs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`expediteur` enum('artisan','client') NOT NULL,
	`contenu` text NOT NULL,
	`lu` boolean DEFAULT false,
	`luAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modeles_devis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`description` text,
	`notes` text,
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modeles_devis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modeles_devis_lignes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modeleId` int NOT NULL,
	`articleId` int,
	`designation` varchar(255) NOT NULL,
	`description` text,
	`quantite` decimal(10,2) DEFAULT '1.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixUnitaireHT` decimal(10,2) DEFAULT '0.00',
	`tauxTVA` decimal(5,2) DEFAULT '20.00',
	`remise` decimal(5,2) DEFAULT '0.00',
	`ordre` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `modeles_devis_lignes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modeles_email` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(100) NOT NULL,
	`type` enum('relance_devis','envoi_devis','envoi_facture','rappel_paiement','autre') NOT NULL,
	`sujet` varchar(255) NOT NULL,
	`contenu` text NOT NULL,
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `modeles_email_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mouvements_stock` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stockId` int NOT NULL,
	`type` enum('entree','sortie','ajustement') NOT NULL,
	`quantite` decimal(10,2) NOT NULL,
	`quantiteAvant` decimal(10,2) NOT NULL,
	`quantiteApres` decimal(10,2) NOT NULL,
	`motif` text,
	`reference` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mouvements_stock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`type` enum('info','alerte','rappel','succes','erreur') DEFAULT 'info',
	`titre` varchar(255) NOT NULL,
	`message` text,
	`lien` varchar(500),
	`lu` boolean DEFAULT false,
	`archived` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `objectifs_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`artisanId` int NOT NULL,
	`mois` int NOT NULL,
	`annee` int NOT NULL,
	`objectifInterventions` int DEFAULT 0,
	`objectifCA` decimal(10,2) DEFAULT '0.00',
	`objectifAvisPositifs` int DEFAULT 0,
	`interventionsRealisees` int DEFAULT 0,
	`caRealise` decimal(10,2) DEFAULT '0.00',
	`avisPositifsObtenus` int DEFAULT 0,
	`pointsGagnes` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `objectifs_techniciens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paiements_stripe` (
	`id` int AUTO_INCREMENT NOT NULL,
	`factureId` int NOT NULL,
	`artisanId` int NOT NULL,
	`stripeSessionId` varchar(255),
	`stripePaymentIntentId` varchar(255),
	`montant` decimal(10,2) NOT NULL,
	`devise` varchar(3) DEFAULT 'EUR',
	`statut` enum('en_attente','complete','echoue','rembourse') DEFAULT 'en_attente',
	`lienPaiement` varchar(500),
	`tokenPaiement` varchar(64),
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paiements_stripe_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parametres_artisan` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`prefixeDevis` varchar(10) DEFAULT 'DEV',
	`prefixeFacture` varchar(10) DEFAULT 'FAC',
	`compteurDevis` int DEFAULT 1,
	`compteurFacture` int DEFAULT 1,
	`mentionsLegales` text,
	`conditionsGenerales` text,
	`notificationsEmail` boolean DEFAULT true,
	`rappelDevisJours` int DEFAULT 7,
	`rappelFactureJours` int DEFAULT 30,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parametres_artisan_id` PRIMARY KEY(`id`),
	CONSTRAINT `parametres_artisan_artisanId_unique` UNIQUE(`artisanId`)
);
--> statement-breakpoint
CREATE TABLE `phases_chantier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chantierId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`description` text,
	`ordre` int DEFAULT 1,
	`dateDebutPrevue` date,
	`dateFinPrevue` date,
	`dateDebutReelle` date,
	`dateFinReelle` date,
	`statut` enum('a_faire','en_cours','termine','annule') DEFAULT 'a_faire',
	`avancement` int DEFAULT 0,
	`budgetPhase` decimal(10,2),
	`coutReel` decimal(10,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `phases_chantier_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `photos_analyse` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analyseId` int NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`ordre` int DEFAULT 1,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `photos_analyse_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `photos_interventions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`interventionMobileId` int NOT NULL,
	`url` varchar(500) NOT NULL,
	`description` varchar(255),
	`type` enum('avant','pendant','apres') DEFAULT 'pendant',
	`takenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `photos_interventions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plan_comptable` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`numeroCompte` varchar(10) NOT NULL,
	`libelle` varchar(100) NOT NULL,
	`classe` int NOT NULL,
	`type` enum('actif','passif','charge','produit') NOT NULL,
	`actif` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `plan_comptable_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `positions_techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`latitude` decimal(10,8) NOT NULL,
	`longitude` decimal(11,8) NOT NULL,
	`precision` int,
	`vitesse` decimal(5,2),
	`cap` int,
	`batterie` int,
	`enDeplacement` boolean DEFAULT false,
	`interventionEnCoursId` int,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `positions_techniciens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `preferences_couleurs_calendrier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`interventionId` int NOT NULL,
	`couleur` varchar(50) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `preferences_couleurs_calendrier_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `preferences_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`nouvelleAssignation` boolean DEFAULT true,
	`modificationIntervention` boolean DEFAULT true,
	`annulationIntervention` boolean DEFAULT true,
	`rappelIntervention` boolean DEFAULT true,
	`nouveauMessage` boolean DEFAULT true,
	`demandeAvis` boolean DEFAULT false,
	`heureDebutNotif` varchar(5) DEFAULT '08:00',
	`heureFinNotif` varchar(5) DEFAULT '20:00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `preferences_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `previsions_ca` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`mois` int NOT NULL,
	`annee` int NOT NULL,
	`caPrevisionnel` decimal(12,2) DEFAULT '0.00',
	`caRealise` decimal(12,2) DEFAULT '0.00',
	`ecart` decimal(12,2) DEFAULT '0.00',
	`ecartPourcentage` decimal(5,2) DEFAULT '0.00',
	`methodeCalcul` enum('moyenne_mobile','regression_lineaire','saisonnalite','manuel') DEFAULT 'moyenne_mobile',
	`confiance` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `previsions_ca_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`userAgent` varchar(255),
	`actif` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rapports_personnalises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(100) NOT NULL,
	`description` text,
	`type` enum('ventes','clients','interventions','stocks','fournisseurs','techniciens','financier') NOT NULL,
	`filtres` json,
	`colonnes` json,
	`groupement` varchar(50),
	`tri` varchar(50),
	`format` enum('tableau','graphique','liste') DEFAULT 'tableau',
	`graphiqueType` enum('bar','line','pie','doughnut'),
	`favori` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rapports_personnalises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `relances_devis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devisId` int NOT NULL,
	`artisanId` int NOT NULL,
	`type` enum('email','notification') NOT NULL,
	`destinataire` varchar(320),
	`message` text,
	`statut` enum('envoye','echec') DEFAULT 'envoye',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relances_devis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resultats_analyse_ia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analyseId` int NOT NULL,
	`typeTravauxDetecte` varchar(255),
	`descriptionTravaux` text,
	`urgence` enum('faible','moyenne','haute','critique') DEFAULT 'moyenne',
	`confiance` decimal(5,2),
	`rawResponse` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resultats_analyse_ia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signatures_devis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devisId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`signatureData` text,
	`signataireName` varchar(255),
	`signataireEmail` varchar(320),
	`ipAddress` varchar(45),
	`userAgent` text,
	`signedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signatures_devis_id` PRIMARY KEY(`id`),
	CONSTRAINT `signatures_devis_devisId_unique` UNIQUE(`devisId`),
	CONSTRAINT `signatures_devis_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `sms_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`signatureId` int NOT NULL,
	`telephone` varchar(20) NOT NULL,
	`code` varchar(6) NOT NULL,
	`verified` boolean DEFAULT false,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sms_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `soldes_conges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`technicienId` int NOT NULL,
	`artisanId` int NOT NULL,
	`type` enum('conge_paye','rtt') NOT NULL,
	`annee` int NOT NULL,
	`soldeInitial` decimal(5,2) DEFAULT '0.00',
	`soldeRestant` decimal(5,2) DEFAULT '0.00',
	`joursAcquis` decimal(5,2) DEFAULT '0.00',
	`joursPris` decimal(5,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `soldes_conges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`articleId` int,
	`articleType` enum('bibliotheque','artisan') DEFAULT 'bibliotheque',
	`reference` varchar(50) NOT NULL,
	`designation` varchar(500) NOT NULL,
	`quantiteEnStock` decimal(10,2) DEFAULT '0.00',
	`seuilAlerte` decimal(10,2) DEFAULT '5.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixAchat` decimal(10,2),
	`emplacement` varchar(100),
	`fournisseur` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suggestions_articles_ia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resultatId` int NOT NULL,
	`articleId` int,
	`nomArticle` varchar(255) NOT NULL,
	`description` text,
	`quantiteSuggeree` decimal(10,2) DEFAULT '1.00',
	`unite` varchar(20) DEFAULT 'unité',
	`prixEstime` decimal(10,2),
	`confiance` decimal(5,2),
	`selectionne` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suggestions_articles_ia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `techniciens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`nom` varchar(255) NOT NULL,
	`prenom` varchar(255),
	`email` varchar(320),
	`telephone` varchar(20),
	`specialite` varchar(100),
	`couleur` varchar(7) DEFAULT '#3b82f6',
	`statut` enum('actif','inactif','conge') DEFAULT 'actif',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `techniciens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64),
	`name` text,
	`email` varchar(320),
	`password` varchar(255),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `vehicules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`artisanId` int NOT NULL,
	`immatriculation` varchar(20) NOT NULL,
	`marque` varchar(100),
	`modele` varchar(100),
	`annee` int,
	`typeCarburant` enum('essence','diesel','electrique','hybride','gpl') DEFAULT 'diesel',
	`kilometrageActuel` int DEFAULT 0,
	`dateAchat` date,
	`prixAchat` decimal(10,2),
	`technicienId` int,
	`statut` enum('actif','en_maintenance','hors_service','vendu') DEFAULT 'actif',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicules_id` PRIMARY KEY(`id`)
);
