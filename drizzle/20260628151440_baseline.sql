CREATE TYPE "public"."user_role" AS ENUM('admin', 'artisan', 'secretaire', 'technicien');--> statement-breakpoint
CREATE TYPE "public"."artisan_specialite" AS ENUM('plomberie', 'electricite', 'chauffage', 'multi-services');--> statement-breakpoint
CREATE TYPE "public"."forme_juridique" AS ENUM('EI', 'micro', 'EURL', 'SARL', 'SAS', 'SASU', 'SA', 'autre');--> statement-breakpoint
CREATE TYPE "public"."client_type" AS ENUM('particulier', 'professionnel');--> statement-breakpoint
CREATE TYPE "public"."facture_cycle_vie" AS ENUM('non_soumise', 'deposee', 'emise', 'recue', 'mise_a_dispo', 'prise_en_charge', 'approuvee', 'en_litige', 'refusee', 'rejetee', 'encaissee', 'paiement_transmis');--> statement-breakpoint
CREATE TYPE "public"."delai_paiement_type" AS ENUM('net', 'fin_de_mois');--> statement-breakpoint
CREATE TYPE "public"."facture_statut" AS ENUM('brouillon', 'validee', 'envoyee', 'payee', 'en_retard', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."facture_type_document" AS ENUM('facture', 'avoir');--> statement-breakpoint
CREATE TYPE "public"."ligne_type" AS ENUM('produit', 'section', 'note');--> statement-breakpoint
CREATE TYPE "public"."modele_email_type" AS ENUM('relance_devis', 'envoi_devis', 'envoi_facture', 'rappel_paiement', 'autre');--> statement-breakpoint
CREATE TYPE "public"."paiement_statut" AS ENUM('en_attente', 'complete', 'echoue', 'rembourse');--> statement-breakpoint
CREATE TYPE "public"."relance_statut" AS ENUM('envoye', 'echec');--> statement-breakpoint
CREATE TYPE "public"."relance_type" AS ENUM('email', 'notification');--> statement-breakpoint
CREATE TYPE "public"."devis_statut" AS ENUM('brouillon', 'envoye', 'accepte', 'refuse', 'expire');--> statement-breakpoint
CREATE TYPE "public"."signature_statut" AS ENUM('en_attente', 'accepte', 'refuse');--> statement-breakpoint
CREATE TYPE "public"."contrat_periodicite" AS ENUM('mensuel', 'trimestriel', 'semestriel', 'annuel');--> statement-breakpoint
CREATE TYPE "public"."contrat_statut" AS ENUM('actif', 'suspendu', 'termine', 'annule');--> statement-breakpoint
CREATE TYPE "public"."contrat_type" AS ENUM('maintenance_preventive', 'entretien', 'depannage', 'contrat_service');--> statement-breakpoint
CREATE TYPE "public"."intervention_contrat_statut" AS ENUM('planifiee', 'en_cours', 'effectuee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."intervention_statut" AS ENUM('planifiee', 'en_cours', 'terminee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."mobile_sync_status" AS ENUM('synced', 'pending', 'error');--> statement-breakpoint
CREATE TYPE "public"."photo_intervention_type" AS ENUM('avant', 'pendant', 'apres');--> statement-breakpoint
CREATE TYPE "public"."rdv_statut" AS ENUM('en_attente', 'confirme', 'refuse', 'annule');--> statement-breakpoint
CREATE TYPE "public"."rdv_urgence" AS ENUM('normale', 'urgente', 'tres_urgente');--> statement-breakpoint
CREATE TYPE "public"."compta_format_export" AS ENUM('fec', 'iif', 'qbo', 'csv');--> statement-breakpoint
CREATE TYPE "public"."compta_frequence_sync" AS ENUM('quotidien', 'hebdomadaire', 'mensuel', 'manuel');--> statement-breakpoint
CREATE TYPE "public"."compta_logiciel" AS ENUM('sage', 'quickbooks', 'ciel', 'ebp', 'autre');--> statement-breakpoint
CREATE TYPE "public"."compte_type" AS ENUM('actif', 'passif', 'charge', 'produit');--> statement-breakpoint
CREATE TYPE "public"."depense_frequence" AS ENUM('mensuelle', 'trimestrielle', 'annuelle');--> statement-breakpoint
CREATE TYPE "public"."depense_mode_paiement" AS ENUM('carte', 'especes', 'virement', 'cheque', 'prelevement');--> statement-breakpoint
CREATE TYPE "public"."depense_statut" AS ENUM('brouillon', 'soumise', 'approuvee', 'rejetee', 'remboursee');--> statement-breakpoint
CREATE TYPE "public"."ecriture_journal" AS ENUM('VE', 'AC', 'BQ', 'OD');--> statement-breakpoint
CREATE TYPE "public"."ecriture_statut" AS ENUM('brouillon', 'validee');--> statement-breakpoint
CREATE TYPE "public"."export_statut" AS ENUM('en_cours', 'termine', 'erreur');--> statement-breakpoint
CREATE TYPE "public"."ndf_statut" AS ENUM('brouillon', 'soumise', 'approuvee', 'rejetee', 'payee');--> statement-breakpoint
CREATE TYPE "public"."prevision_methode" AS ENUM('moyenne_mobile', 'regression_lineaire', 'saisonnalite', 'manuel');--> statement-breakpoint
CREATE TYPE "public"."releve_statut" AS ENUM('en_cours', 'termine', 'erreur');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."alerte_envoi_statut" AS ENUM('envoye', 'echec', 'lu');--> statement-breakpoint
CREATE TYPE "public"."assurance_type" AS ENUM('tiers', 'tiers_plus', 'tous_risques');--> statement-breakpoint
CREATE TYPE "public"."classement_periode" AS ENUM('semaine', 'mois', 'trimestre', 'annee');--> statement-breakpoint
CREATE TYPE "public"."conge_statut" AS ENUM('en_attente', 'approuve', 'refuse', 'annule');--> statement-breakpoint
CREATE TYPE "public"."conge_type" AS ENUM('conge_paye', 'rtt', 'maladie', 'sans_solde', 'formation', 'autre');--> statement-breakpoint
CREATE TYPE "public"."entretien_type" AS ENUM('vidange', 'pneus', 'freins', 'controle_technique', 'revision', 'reparation', 'autre');--> statement-breakpoint
CREATE TYPE "public"."notif_push_type" AS ENUM('assignation', 'modification', 'annulation', 'rappel', 'message', 'avis');--> statement-breakpoint
CREATE TYPE "public"."solde_conge_type" AS ENUM('conge_paye', 'rtt');--> statement-breakpoint
CREATE TYPE "public"."technicien_statut" AS ENUM('actif', 'inactif', 'conge');--> statement-breakpoint
CREATE TYPE "public"."type_contrat" AS ENUM('cdi', 'cdd', 'interimaire', 'sous_traitant');--> statement-breakpoint
CREATE TYPE "public"."vehicule_carburant" AS ENUM('essence', 'diesel', 'electrique', 'hybride', 'gpl');--> statement-breakpoint
CREATE TYPE "public"."vehicule_statut" AS ENUM('actif', 'en_maintenance', 'hors_service', 'vendu');--> statement-breakpoint
CREATE TYPE "public"."activite_entite_type" AS ENUM('client', 'devis', 'facture', 'chantier', 'aucun');--> statement-breakpoint
CREATE TYPE "public"."activite_type" AS ENUM('appel', 'email', 'rdv', 'relance', 'autre');--> statement-breakpoint
CREATE TYPE "public"."alerte_canal" AS ENUM('email', 'sms', 'les_deux');--> statement-breakpoint
CREATE TYPE "public"."alerte_frequence" AS ENUM('quotidien', 'hebdomadaire', 'mensuel');--> statement-breakpoint
CREATE TYPE "public"."alerte_type" AS ENUM('depassement_positif', 'depassement_negatif');--> statement-breakpoint
CREATE TYPE "public"."analyse_statut" AS ENUM('en_attente', 'en_cours', 'termine', 'erreur');--> statement-breakpoint
CREATE TYPE "public"."analyse_urgence" AS ENUM('faible', 'moyenne', 'haute', 'critique');--> statement-breakpoint
CREATE TYPE "public"."avis_statut" AS ENUM('en_attente', 'publie', 'masque');--> statement-breakpoint
CREATE TYPE "public"."badge_categorie" AS ENUM('interventions', 'avis', 'ca', 'anciennete', 'special');--> statement-breakpoint
CREATE TYPE "public"."chantier_priorite" AS ENUM('basse', 'normale', 'haute', 'urgente');--> statement-breakpoint
CREATE TYPE "public"."chantier_statut" AS ENUM('planifie', 'en_cours', 'en_pause', 'termine', 'annule');--> statement-breakpoint
CREATE TYPE "public"."commande_statut" AS ENUM('brouillon', 'envoyee', 'confirmee', 'partiellement_livree', 'livree', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."commande_statut_facturation" AS ENUM('a_facturer', 'facturee');--> statement-breakpoint
CREATE TYPE "public"."conversation_statut" AS ENUM('ouverte', 'fermee', 'archivee');--> statement-breakpoint
CREATE TYPE "public"."demande_avis_statut" AS ENUM('envoyee', 'ouverte', 'completee', 'expiree');--> statement-breakpoint
CREATE TYPE "public"."demande_contact_statut" AS ENUM('nouveau', 'contacte', 'converti', 'perdu');--> statement-breakpoint
CREATE TYPE "public"."document_chantier_type" AS ENUM('plan', 'photo', 'permis', 'contrat', 'facture', 'autre');--> statement-breakpoint
CREATE TYPE "public"."message_auteur" AS ENUM('artisan', 'client');--> statement-breakpoint
CREATE TYPE "public"."mouvement_type" AS ENUM('entree', 'sortie', 'ajustement');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('info', 'alerte', 'rappel', 'succes', 'erreur');--> statement-breakpoint
CREATE TYPE "public"."phase_statut" AS ENUM('a_faire', 'en_cours', 'termine', 'annule');--> statement-breakpoint
CREATE TYPE "public"."rapport_format" AS ENUM('tableau', 'graphique', 'liste');--> statement-breakpoint
CREATE TYPE "public"."rapport_graphique_type" AS ENUM('bar', 'line', 'pie', 'doughnut');--> statement-breakpoint
CREATE TYPE "public"."rapport_type" AS ENUM('ventes', 'clients', 'interventions', 'stocks', 'fournisseurs', 'techniciens', 'financier');--> statement-breakpoint
CREATE TYPE "public"."stock_article_type" AS ENUM('bibliotheque', 'artisan');--> statement-breakpoint
CREATE TYPE "public"."suivi_statut" AS ENUM('a_faire', 'en_cours', 'termine');--> statement-breakpoint
CREATE TABLE "active_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"artisan_id" integer NOT NULL,
	"session_token" varchar(200) NOT NULL,
	"device_fingerprint" varchar(255),
	"ip" varchar(64),
	"expires_at" timestamp NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_user_token" UNIQUE("user_id","session_token")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_user_id" integer,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(50),
	"target_id" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"artisan_id" integer NOT NULL,
	"device_fingerprint" varchar(255) NOT NULL,
	"device_type" varchar(50),
	"browser" varchar(100),
	"os" varchar(100),
	"last_ip" varchar(64),
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "devices_user_fingerprint" UNIQUE("user_id","device_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer,
	"userId" integer,
	"entityType" varchar(100) NOT NULL,
	"entityId" integer NOT NULL,
	"action" varchar(100) NOT NULL,
	"details" text,
	"payload" jsonb,
	"occurred_at" timestamp with time zone,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"userId" integer,
	"entityType" varchar(64) NOT NULL,
	"entityId" integer NOT NULL,
	"action" varchar(128) NOT NULL,
	"payload" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions_utilisateur" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"permission" varchar(50) NOT NULL,
	"autorise" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"expiresAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64),
	"name" text,
	"prenom" varchar(255),
	"email" varchar(320),
	"password" varchar(255),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'artisan' NOT NULL,
	"artisanId" integer,
	"actif" boolean DEFAULT true NOT NULL,
	"resetToken" varchar(64),
	"resetTokenExpiry" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	"passwordChangedAt" timestamp,
	"registrationIp" varchar(64),
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "artisan_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"module_slug" varchar(50) NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"activated_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_artisan_module" UNIQUE("artisan_id","module_slug")
);
--> statement-breakpoint
CREATE TABLE "artisans" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"siret" varchar(14),
	"nomEntreprise" varchar(255),
	"adresse" text,
	"codePostal" varchar(10),
	"ville" varchar(100),
	"telephone" varchar(20),
	"email" varchar(320),
	"specialite" "artisan_specialite" DEFAULT 'plomberie',
	"tauxTVA" numeric(5, 2) DEFAULT '20.00',
	"numeroTVA" varchar(20),
	"iban" varchar(34),
	"codeAPE" varchar(10),
	"formeJuridique" "forme_juridique",
	"capitalSocial" numeric(12, 2),
	"villeRCS" varchar(100),
	"numeroRM" varchar(50),
	"logo" text,
	"slug" varchar(255),
	"icalToken" varchar(64),
	"metier" varchar(100),
	"plan" varchar(20) DEFAULT 'essentiel',
	"onboarding_completed" boolean DEFAULT false,
	"franchiseTVA" boolean DEFAULT false NOT NULL,
	"assuranceDecennaleNom" varchar(255),
	"assuranceDecennalePolice" varchar(100),
	"assuranceDecennaleGarantie" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"pendingDeletionAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artisans_userId_unique" UNIQUE("userId"),
	CONSTRAINT "artisans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50) NOT NULL,
	"categorie" varchar(50) NOT NULL,
	"plan_minimum" varchar(20) DEFAULT 'essentiel' NOT NULL,
	"actif_par_defaut" boolean DEFAULT true NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "modules_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "parametres_artisan" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"prefixeDevis" varchar(10) DEFAULT 'DEV',
	"prefixeFacture" varchar(10) DEFAULT 'FAC',
	"prefixeAvoir" varchar(10) DEFAULT 'AV',
	"compteurDevis" integer DEFAULT 1,
	"compteurFacture" integer DEFAULT 1,
	"compteurAvoir" integer DEFAULT 1,
	"mentionsLegales" text,
	"conditionsGenerales" text,
	"mediateurConsommation" text,
	"notificationsEmail" boolean DEFAULT true,
	"rappelDevisJours" integer DEFAULT 7,
	"rappelFactureJours" integer DEFAULT 30,
	"objectifCA" numeric(10, 2) DEFAULT '0',
	"objectifDevis" integer DEFAULT 0,
	"objectifClients" integer DEFAULT 0,
	"vitrineActive" boolean DEFAULT false,
	"vitrineDescription" text,
	"vitrineZone" varchar(500),
	"vitrineServices" text,
	"vitrineExperience" integer,
	"couleurPrincipale" varchar(20) DEFAULT '#4F46E5',
	"couleurSecondaire" varchar(20) DEFAULT '#6366F1',
	"conditionsPaiementDefaut" text,
	"delaiPaiementJours" integer,
	"delaiPaiementType" "delai_paiement_type" DEFAULT 'net',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parametres_artisan_artisanId_unique" UNIQUE("artisanId")
);
--> statement-breakpoint
CREATE TABLE "client_portal_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"clientId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"email" varchar(320) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"lastAccessAt" timestamp,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_portal_access_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "client_portal_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"clientId" integer NOT NULL,
	"sessionToken" varchar(64) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"userAgent" text,
	"ipAddress" varchar(45),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_portal_sessions_sessionToken_unique" UNIQUE("sessionToken")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"nom" varchar(255) NOT NULL,
	"prenom" varchar(255),
	"email" varchar(320),
	"telephone" varchar(20),
	"adresse" text,
	"codePostal" varchar(10),
	"ville" varchar(100),
	"adresseFacturation" text,
	"codePostalFacturation" varchar(10),
	"villeFacturation" varchar(100),
	"type" "client_type" DEFAULT 'particulier',
	"raisonSociale" varchar(255),
	"siret" varchar(14),
	"numeroTVA" varchar(20),
	"etiquettes" varchar(500),
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_relances_auto" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"actif" boolean DEFAULT false,
	"joursApresEnvoi" integer DEFAULT 7,
	"joursEntreRelances" integer DEFAULT 7,
	"nombreMaxRelances" integer DEFAULT 3,
	"heureEnvoi" varchar(5) DEFAULT '09:00',
	"joursEnvoi" varchar(50) DEFAULT '1,2,3,4,5',
	"modeleEmailId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "config_relances_auto_artisanId_unique" UNIQUE("artisanId")
);
--> statement-breakpoint
CREATE TABLE "emails_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer,
	"destinataire" varchar(320) NOT NULL,
	"sujet" varchar(500) NOT NULL,
	"type" varchar(50),
	"resendId" varchar(255),
	"statut" varchar(20) NOT NULL,
	"erreur" text,
	"entiteType" varchar(50),
	"entiteId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factures" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"devisId" integer,
	"numero" varchar(50),
	"dateFacture" timestamp DEFAULT now() NOT NULL,
	"dateEcheance" timestamp,
	"statut" "facture_statut" DEFAULT 'brouillon',
	"typeDocument" "facture_type_document" DEFAULT 'facture',
	"factureOrigineId" integer,
	"objet" text,
	"referenceClient" varchar(100),
	"siretDestinataire" varchar(14),
	"conditionsPaiement" text,
	"notes" text,
	"totalHT" numeric(10, 2) DEFAULT '0.00',
	"totalTVA" numeric(10, 2) DEFAULT '0.00',
	"totalTTC" numeric(10, 2) DEFAULT '0.00',
	"montantPaye" numeric(10, 2) DEFAULT '0.00',
	"datePaiement" timestamp,
	"modePaiement" varchar(50),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"statutCycleVie" "facture_cycle_vie" DEFAULT 'non_soumise',
	"paId" varchar(100),
	"paDocumentId" varchar(100),
	"paFormat" varchar(50),
	"nombreRelances" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factures_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"factureId" integer NOT NULL,
	"ordre" integer DEFAULT 0,
	"articleId" integer,
	"reference" varchar(50),
	"designation" varchar(500) NOT NULL,
	"description" text,
	"quantite" numeric(10, 2) DEFAULT '1.00',
	"unite" varchar(20) DEFAULT 'unité',
	"prixUnitaireHT" numeric(10, 2) NOT NULL,
	"tauxTVA" numeric(5, 2) DEFAULT '20.00',
	"remise" numeric(5, 2) DEFAULT '0.00',
	"montantHT" numeric(10, 2) DEFAULT '0.00',
	"montantTVA" numeric(10, 2) DEFAULT '0.00',
	"montantTTC" numeric(10, 2) DEFAULT '0.00',
	"type" "ligne_type" DEFAULT 'produit',
	"tvaCategorieId" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "modeles_email" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"nom" varchar(100) NOT NULL,
	"type" "modele_email_type" NOT NULL,
	"sujet" varchar(255) NOT NULL,
	"contenu" text NOT NULL,
	"isDefault" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paiements_stripe" (
	"id" serial PRIMARY KEY NOT NULL,
	"factureId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"stripeSessionId" varchar(255),
	"stripePaymentIntentId" varchar(255),
	"montant" numeric(10, 2) NOT NULL,
	"devise" varchar(3) DEFAULT 'EUR',
	"statut" "paiement_statut" DEFAULT 'en_attente',
	"lienPaiement" varchar(500),
	"tokenPaiement" varchar(64),
	"paidAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relances_devis" (
	"id" serial PRIMARY KEY NOT NULL,
	"devisId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"type" "relance_type" NOT NULL,
	"destinataire" varchar(320),
	"message" text,
	"statut" "relance_statut" DEFAULT 'envoye',
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tva_categories" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"taux" numeric(5, 2) NOT NULL,
	"label" varchar(100) NOT NULL,
	"mention_legale" text,
	"code_facturx" varchar(5),
	"compte_collecte" varchar(10),
	"ordre" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devis" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"numero" varchar(50) NOT NULL,
	"dateDevis" timestamp DEFAULT now() NOT NULL,
	"dateValidite" timestamp,
	"dateVue" timestamp,
	"statut" "devis_statut" DEFAULT 'brouillon',
	"objet" text,
	"referenceClient" varchar(100),
	"conditionsPaiement" text,
	"notes" text,
	"totalHT" numeric(10, 2) DEFAULT '0.00',
	"totalTVA" numeric(10, 2) DEFAULT '0.00',
	"totalTTC" numeric(10, 2) DEFAULT '0.00',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devis_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"devisId" integer NOT NULL,
	"ordre" integer DEFAULT 0,
	"reference" varchar(50),
	"designation" varchar(500) NOT NULL,
	"description" text,
	"quantite" numeric(10, 2) DEFAULT '1.00',
	"unite" varchar(20) DEFAULT 'unité',
	"prixUnitaireHT" numeric(10, 2) NOT NULL,
	"tauxTVA" numeric(5, 2) DEFAULT '20.00',
	"remise" numeric(5, 2) DEFAULT '0.00',
	"montantHT" numeric(10, 2) DEFAULT '0.00',
	"montantTVA" numeric(10, 2) DEFAULT '0.00',
	"montantTTC" numeric(10, 2) DEFAULT '0.00',
	"type" "ligne_type" DEFAULT 'produit',
	"tvaCategorieId" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "devis_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"devisId" integer NOT NULL,
	"nom" varchar(100) NOT NULL,
	"description" text,
	"ordre" integer DEFAULT 1,
	"totalHT" numeric(10, 2) DEFAULT '0.00',
	"totalTVA" numeric(10, 2) DEFAULT '0.00',
	"totalTTC" numeric(10, 2) DEFAULT '0.00',
	"recommandee" boolean DEFAULT false,
	"selectionnee" boolean DEFAULT false,
	"dateSelection" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devis_options_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"optionId" integer NOT NULL,
	"articleId" integer,
	"designation" varchar(255) NOT NULL,
	"description" text,
	"quantite" numeric(10, 2) DEFAULT '1.00',
	"unite" varchar(20) DEFAULT 'unité',
	"prixUnitaireHT" numeric(10, 2) DEFAULT '0.00',
	"tauxTVA" numeric(5, 2) DEFAULT '20.00',
	"remise" numeric(5, 2) DEFAULT '0.00',
	"montantHT" numeric(10, 2) DEFAULT '0.00',
	"montantTVA" numeric(10, 2) DEFAULT '0.00',
	"montantTTC" numeric(10, 2) DEFAULT '0.00',
	"ordre" integer DEFAULT 1,
	"tvaCategorieId" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "modeles_devis" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"nom" varchar(255) NOT NULL,
	"description" text,
	"notes" text,
	"isDefault" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modeles_devis_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"modeleId" integer NOT NULL,
	"articleId" integer,
	"designation" varchar(255) NOT NULL,
	"description" text,
	"quantite" numeric(10, 2) DEFAULT '1.00',
	"unite" varchar(20) DEFAULT 'unité',
	"prixUnitaireHT" numeric(10, 2) DEFAULT '0.00',
	"tauxTVA" numeric(5, 2) DEFAULT '20.00',
	"remise" numeric(5, 2) DEFAULT '0.00',
	"tvaCategorieId" varchar(30),
	"ordre" integer DEFAULT 1,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures_devis" (
	"id" serial PRIMARY KEY NOT NULL,
	"devisId" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"statut" "signature_statut" DEFAULT 'en_attente',
	"signatureData" text,
	"signataireName" varchar(255),
	"signataireEmail" varchar(320),
	"ipAddress" varchar(45),
	"userAgent" text,
	"motifRefus" text,
	"signedAt" timestamp,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"documentHash" varchar(64),
	"documentHashedAt" timestamp,
	CONSTRAINT "signatures_devis_devisId_unique" UNIQUE("devisId"),
	CONSTRAINT "signatures_devis_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sms_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"signatureId" integer NOT NULL,
	"telephone" varchar(20) NOT NULL,
	"code" varchar(6) NOT NULL,
	"verified" boolean DEFAULT false,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contrats_maintenance" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"reference" varchar(50) NOT NULL,
	"titre" varchar(255) NOT NULL,
	"description" text,
	"type" "contrat_type" DEFAULT 'entretien',
	"montantHT" numeric(10, 2) NOT NULL,
	"tauxTVA" numeric(5, 2) DEFAULT '20.00',
	"periodicite" "contrat_periodicite" NOT NULL,
	"dateDebut" timestamp NOT NULL,
	"dateFin" timestamp,
	"reconduction" boolean DEFAULT true,
	"preavisResiliation" integer DEFAULT 1,
	"alerteReconductionEnvoyeeLe" timestamp,
	"prochainFacturation" timestamp,
	"prochainPassage" timestamp,
	"conditionsParticulieres" text,
	"statut" "contrat_statut" DEFAULT 'actif',
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factures_recurrentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contratId" integer NOT NULL,
	"factureId" integer NOT NULL,
	"periodeDebut" timestamp NOT NULL,
	"periodeFin" timestamp NOT NULL,
	"genereeAutomatiquement" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interventions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"titre" varchar(255) NOT NULL,
	"description" text,
	"dateDebut" timestamp NOT NULL,
	"dateFin" timestamp,
	"statut" "intervention_statut" DEFAULT 'planifiee',
	"adresse" text,
	"notes" text,
	"devisId" integer,
	"factureId" integer,
	"technicienId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interventions_chantier" (
	"id" serial PRIMARY KEY NOT NULL,
	"chantierId" integer NOT NULL,
	"interventionId" integer NOT NULL,
	"phaseId" integer,
	"ordre" integer DEFAULT 1,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interventions_contrat" (
	"id" serial PRIMARY KEY NOT NULL,
	"contratId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"titre" varchar(255) NOT NULL,
	"description" text,
	"dateIntervention" timestamp NOT NULL,
	"duree" varchar(50),
	"technicienNom" varchar(255),
	"statut" "intervention_contrat_statut" DEFAULT 'planifiee',
	"rapport" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interventions_mobile" (
	"id" serial PRIMARY KEY NOT NULL,
	"interventionId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"heureArrivee" timestamp,
	"heureDepart" timestamp,
	"notesIntervention" text,
	"signatureClient" text,
	"signatureDate" timestamp,
	"syncStatus" "mobile_sync_status" DEFAULT 'synced',
	"lastSyncAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interventions_techniciens" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"interventionId" integer NOT NULL,
	"technicienId" integer NOT NULL,
	"role" varchar(50),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos_interventions" (
	"id" serial PRIMARY KEY NOT NULL,
	"interventionMobileId" integer NOT NULL,
	"url" varchar(500) NOT NULL,
	"description" varchar(255),
	"type" "photo_intervention_type" DEFAULT 'pendant',
	"takenAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rdv_en_ligne" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"titre" varchar(255) NOT NULL,
	"description" text,
	"dateProposee" timestamp NOT NULL,
	"dureeEstimee" integer DEFAULT 60,
	"statut" "rdv_statut" DEFAULT 'en_attente',
	"motifRefus" text,
	"urgence" "rdv_urgence" DEFAULT 'normale',
	"interventionId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_charge_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"attempt_no" integer NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"status" varchar(20) DEFAULT 'initiated' NOT NULL,
	"failure_code" varchar(100),
	"failure_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_charge_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "uniq_cycle_attempt_no" UNIQUE("cycle_id","attempt_no")
);
--> statement-breakpoint
CREATE TABLE "billing_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'eur' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"charging_started_at" timestamp,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp,
	"paid_at" timestamp,
	"failed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_cycle_per_period" UNIQUE("subscription_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" integer NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"actor" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoice_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_cents" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_amount_cents" bigint DEFAULT 0 NOT NULL,
	"type" varchar(50) NOT NULL,
	"metadata" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoice_sequences" (
	"series" varchar(10) NOT NULL,
	"year" integer NOT NULL,
	"next_val" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "billing_invoice_sequences_series_year_pk" PRIMARY KEY("series","year")
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"number" varchar(30),
	"stripe_invoice_id" varchar(255),
	"stripe_invoice_number" varchar(100),
	"type" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"credit_amount_cents" bigint DEFAULT 0 NOT NULL,
	"refund_amount_cents" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'eur' NOT NULL,
	"billing_cycle_id" integer,
	"original_invoice_id" integer,
	"stripe_payment_intent_id" varchar(255),
	"pdf_url" text,
	"buyer_siren" varchar(9),
	"buyer_routing_id" varchar(255),
	"einvoice_format" varchar(20),
	"einvoice_status" varchar(30),
	"einvoice_pa_message_id" varchar(255),
	"einvoice_hash" varchar(64),
	"due_at" timestamp,
	"paid_at" timestamp,
	"voided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "billing_invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id"),
	CONSTRAINT "billing_invoices_billing_cycle_id_unique" UNIQUE("billing_cycle_id")
);
--> statement-breakpoint
CREATE TABLE "billing_payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"stripe_payment_method_id" varchar(255) NOT NULL,
	"brand" varchar(50),
	"last4" varchar(4),
	"exp_month" integer,
	"exp_year" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"consented_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_payment_methods_stripe_payment_method_id_unique" UNIQUE("stripe_payment_method_id")
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"plan_id" varchar(50) NOT NULL,
	"billing_interval" varchar(10) DEFAULT 'monthly' NOT NULL,
	"billing_mode" varchar(20) DEFAULT 'maison' NOT NULL,
	"status" varchar(50) NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at" timestamp,
	"canceled_at" timestamp,
	"trial_ends_at" timestamp,
	"payment_method_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscriptions_artisan_id_unique" UNIQUE("artisan_id")
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"stripe_event_id" varchar(255) PRIMARY KEY NOT NULL,
	"type" varchar(100) NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"stripe_price_id" varchar(255),
	"plan" varchar(50) DEFAULT 'trial' NOT NULL,
	"status" varchar(50) DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"max_users" integer DEFAULT 1 NOT NULL,
	"max_devices_per_user" integer DEFAULT 3 NOT NULL,
	"max_concurrent_sessions" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_artisan_id_unique" UNIQUE("artisan_id")
);
--> statement-breakpoint
CREATE TABLE "budgets_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"categorie" varchar(50) NOT NULL,
	"mois" varchar(7) NOT NULL,
	"budget" numeric(10, 2) DEFAULT '0',
	"depense_reelle" numeric(10, 2) DEFAULT '0',
	CONSTRAINT "uq_budget_mois" UNIQUE("artisan_id","categorie","mois")
);
--> statement-breakpoint
CREATE TABLE "categories_depenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"nom" varchar(100) NOT NULL,
	"couleur" varchar(20) DEFAULT '#6366f1',
	"icone" varchar(50) DEFAULT 'Receipt',
	"compte_comptable" varchar(10),
	"deductible_tva" boolean DEFAULT true,
	"deductible_ir" boolean DEFAULT true,
	"plafond_mensuel" numeric(10, 2),
	"actif" boolean DEFAULT true,
	"ordre" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_cat_artisan_nom" UNIQUE("artisan_id","nom")
);
--> statement-breakpoint
CREATE TABLE "configurations_comptables" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"logiciel" "compta_logiciel" DEFAULT 'sage',
	"formatExport" "compta_format_export" DEFAULT 'fec',
	"compteVentes" varchar(20) DEFAULT '706000',
	"compteTVACollectee" varchar(20) DEFAULT '445710',
	"compteClients" varchar(20) DEFAULT '411000',
	"compteAchats" varchar(20) DEFAULT '607000',
	"compteTVADeductible" varchar(20) DEFAULT '445660',
	"compteFournisseurs" varchar(20) DEFAULT '401000',
	"compteBanque" varchar(20) DEFAULT '512000',
	"compteCaisse" varchar(20) DEFAULT '530000',
	"journalVentes" varchar(10) DEFAULT 'VE',
	"journalAchats" varchar(10) DEFAULT 'AC',
	"journalBanque" varchar(10) DEFAULT 'BQ',
	"prefixeFacture" varchar(10) DEFAULT 'FA',
	"prefixeAvoir" varchar(10) DEFAULT 'AV',
	"exerciceDebut" integer DEFAULT 1,
	"actif" boolean DEFAULT true,
	"syncAutoFactures" boolean DEFAULT false,
	"syncAutoPaiements" boolean DEFAULT false,
	"frequenceSync" "compta_frequence_sync" DEFAULT 'manuel',
	"heureSync" varchar(5) DEFAULT '02:00',
	"notifierErreurs" boolean DEFAULT true,
	"notifierSucces" boolean DEFAULT false,
	"derniereSync" timestamp,
	"prochainSync" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "configurations_comptables_artisanId_unique" UNIQUE("artisanId")
);
--> statement-breakpoint
CREATE TABLE "depenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"numero" varchar(20) NOT NULL,
	"date_depense" date NOT NULL,
	"fournisseur" varchar(255),
	"categorie" varchar(50) NOT NULL,
	"sous_categorie" varchar(100),
	"description" text,
	"montant_ht" numeric(10, 2) DEFAULT '0' NOT NULL,
	"taux_tva" numeric(5, 2) DEFAULT '20',
	"montant_tva" numeric(10, 2) DEFAULT '0',
	"montant_ttc" numeric(10, 2) DEFAULT '0' NOT NULL,
	"mode_paiement" "depense_mode_paiement" DEFAULT 'carte',
	"statut" "depense_statut" DEFAULT 'brouillon',
	"remboursable" boolean DEFAULT true,
	"rembourse" boolean DEFAULT false,
	"date_remboursement" date,
	"chantier_id" integer,
	"intervention_id" integer,
	"client_id" integer,
	"notes" text,
	"justificatif_url" text,
	"justificatif_nom" varchar(255),
	"ocr_brut" text,
	"ocr_traite" boolean DEFAULT false,
	"recurrente" boolean DEFAULT false,
	"frequence_recurrence" "depense_frequence",
	"prochaine_occurrence" date,
	"tva_deductible" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ecritures_comptables" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"dateEcriture" timestamp NOT NULL,
	"journal" "ecriture_journal" NOT NULL,
	"numeroCompte" varchar(10) NOT NULL,
	"libelleCompte" varchar(100),
	"libelle" varchar(255) NOT NULL,
	"pieceRef" varchar(50),
	"debit" numeric(12, 2) DEFAULT '0.00',
	"credit" numeric(12, 2) DEFAULT '0.00',
	"factureId" integer,
	"lettrage" varchar(10),
	"pointage" boolean DEFAULT false,
	"statut" "ecriture_statut" DEFAULT 'brouillon' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports_comptables" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"logiciel" "compta_logiciel" NOT NULL,
	"formatExport" "compta_format_export" NOT NULL,
	"periodeDebut" date NOT NULL,
	"periodeFin" date NOT NULL,
	"nombreEcritures" integer DEFAULT 0,
	"montantTotal" numeric(12, 2),
	"fichierUrl" text,
	"statut" "export_statut" DEFAULT 'en_cours',
	"erreur" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historique_ca" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"mois" integer NOT NULL,
	"annee" integer NOT NULL,
	"caTotal" numeric(12, 2) DEFAULT '0.00',
	"nombreFactures" integer DEFAULT 0,
	"nombreClients" integer DEFAULT 0,
	"panierMoyen" numeric(10, 2) DEFAULT '0.00',
	"tauxConversion" numeric(5, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes_de_frais" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"numero" varchar(20) NOT NULL,
	"titre" varchar(255) NOT NULL,
	"periode_debut" date NOT NULL,
	"periode_fin" date NOT NULL,
	"statut" "ndf_statut" DEFAULT 'brouillon',
	"montant_total" numeric(10, 2) DEFAULT '0',
	"montant_rembourse" numeric(10, 2) DEFAULT '0',
	"date_soumission" date,
	"date_approbation" date,
	"date_paiement" date,
	"commentaire_approbateur" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notes_frais_depenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"depense_id" integer NOT NULL,
	CONSTRAINT "uq_note_depense" UNIQUE("note_id","depense_id")
);
--> statement-breakpoint
CREATE TABLE "plan_comptable" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"numeroCompte" varchar(10) NOT NULL,
	"libelle" varchar(100) NOT NULL,
	"classe" integer NOT NULL,
	"type" "compte_type" NOT NULL,
	"actif" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "previsions_ca" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"mois" integer NOT NULL,
	"annee" integer NOT NULL,
	"caPrevisionnel" numeric(12, 2) DEFAULT '0.00',
	"caRealise" numeric(12, 2) DEFAULT '0.00',
	"ecart" numeric(12, 2) DEFAULT '0.00',
	"ecartPourcentage" numeric(5, 2) DEFAULT '0.00',
	"methodeCalcul" "prevision_methode" DEFAULT 'moyenne_mobile',
	"confiance" numeric(5, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regles_categorisation" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"motif_libelle" varchar(255) NOT NULL,
	"categorie" varchar(50) NOT NULL,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "releves_bancaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"nom_fichier" varchar(255) NOT NULL,
	"date_import" timestamp DEFAULT now(),
	"nb_transactions" integer DEFAULT 0,
	"nb_importees" integer DEFAULT 0,
	"statut" "releve_statut" DEFAULT 'en_cours'
);
--> statement-breakpoint
CREATE TABLE "transactions_bancaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"releve_id" integer,
	"date_transaction" date NOT NULL,
	"libelle" text NOT NULL,
	"montant" numeric(10, 2) NOT NULL,
	"type_transaction" "transaction_type" NOT NULL,
	"categorie_suggeree" varchar(50),
	"depense_id" integer,
	"ignoree" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assurances_vehicules" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehiculeId" integer NOT NULL,
	"compagnie" varchar(255) NOT NULL,
	"numeroContrat" varchar(100),
	"typeAssurance" "assurance_type" DEFAULT 'tiers',
	"dateDebut" date NOT NULL,
	"dateFin" date NOT NULL,
	"primeAnnuelle" numeric(10, 2),
	"franchise" numeric(10, 2),
	"document" text,
	"alerteEnvoyee" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classement_techniciens" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"periode" "classement_periode" NOT NULL,
	"dateDebut" date NOT NULL,
	"dateFin" date NOT NULL,
	"rang" integer NOT NULL,
	"pointsTotal" integer DEFAULT 0,
	"interventions" integer DEFAULT 0,
	"ca" numeric(10, 2) DEFAULT '0.00',
	"noteMoyenne" numeric(3, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conges" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"type" "conge_type" NOT NULL,
	"dateDebut" date NOT NULL,
	"dateFin" date NOT NULL,
	"demiJourneeDebut" boolean DEFAULT false,
	"demiJourneeFin" boolean DEFAULT false,
	"motif" text,
	"statut" "conge_statut" DEFAULT 'en_attente',
	"commentaireValidation" text,
	"dateValidation" timestamp,
	"validePar" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disponibilites_techniciens" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"jourSemaine" integer NOT NULL,
	"heureDebut" varchar(5) NOT NULL,
	"heureFin" varchar(5) NOT NULL,
	"disponible" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entretiens_vehicules" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehiculeId" integer NOT NULL,
	"type" "entretien_type" NOT NULL,
	"dateEntretien" date NOT NULL,
	"kilometrageEntretien" integer,
	"cout" numeric(10, 2),
	"prestataire" varchar(255),
	"description" text,
	"prochainEntretienKm" integer,
	"prochainEntretienDate" date,
	"facture" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habilitations_techniciens" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"type" varchar(255) NOT NULL,
	"numero" varchar(100),
	"organisme" varchar(255),
	"dateObtention" date,
	"dateExpiration" date,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historique_deplacements" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"interventionId" integer,
	"dateDebut" timestamp NOT NULL,
	"dateFin" timestamp,
	"distanceKm" numeric(8, 2),
	"dureeMinutes" integer,
	"latitudeDepart" numeric(10, 8),
	"longitudeDepart" numeric(11, 8),
	"latitudeArrivee" numeric(10, 8),
	"longitudeArrivee" numeric(11, 8),
	"adresseDepart" text,
	"adresseArrivee" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historique_kilometrage" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehiculeId" integer NOT NULL,
	"technicienId" integer,
	"kilometrage" integer NOT NULL,
	"dateReleve" date NOT NULL,
	"motif" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historique_notifications_push" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"type" "notif_push_type" NOT NULL,
	"titre" varchar(100) NOT NULL,
	"corps" text,
	"referenceId" integer,
	"referenceType" varchar(50),
	"statut" "alerte_envoi_statut" DEFAULT 'envoye',
	"dateEnvoi" timestamp DEFAULT now() NOT NULL,
	"dateLecture" timestamp
);
--> statement-breakpoint
CREATE TABLE "objectifs_techniciens" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"mois" integer NOT NULL,
	"annee" integer NOT NULL,
	"objectifInterventions" integer DEFAULT 0,
	"objectifCA" numeric(10, 2) DEFAULT '0.00',
	"objectifAvisPositifs" integer DEFAULT 0,
	"interventionsRealisees" integer DEFAULT 0,
	"caRealise" numeric(10, 2) DEFAULT '0.00',
	"avisPositifsObtenus" integer DEFAULT 0,
	"pointsGagnes" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions_techniciens" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"latitude" numeric(10, 8) NOT NULL,
	"longitude" numeric(11, 8) NOT NULL,
	"precision" integer,
	"vitesse" numeric(5, 2),
	"cap" integer,
	"batterie" integer,
	"enDeplacement" boolean DEFAULT false,
	"interventionEnCoursId" integer,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"nouvelleAssignation" boolean DEFAULT true,
	"modificationIntervention" boolean DEFAULT true,
	"annulationIntervention" boolean DEFAULT true,
	"rappelIntervention" boolean DEFAULT true,
	"nouveauMessage" boolean DEFAULT true,
	"demandeAvis" boolean DEFAULT false,
	"heureDebutNotif" varchar(5) DEFAULT '08:00',
	"heureFinNotif" varchar(5) DEFAULT '20:00',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"userAgent" varchar(255),
	"actif" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soldes_conges" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"type" "solde_conge_type" NOT NULL,
	"annee" integer NOT NULL,
	"soldeInitial" numeric(5, 2) DEFAULT '0.00',
	"soldeRestant" numeric(5, 2) DEFAULT '0.00',
	"joursAcquis" numeric(5, 2) DEFAULT '0.00',
	"joursPris" numeric(5, 2) DEFAULT '0.00',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "techniciens" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"nom" varchar(255) NOT NULL,
	"prenom" varchar(255),
	"email" varchar(320),
	"telephone" varchar(20),
	"specialite" varchar(100),
	"couleur" varchar(7) DEFAULT '#3b82f6',
	"statut" "technicien_statut" DEFAULT 'actif',
	"coutHoraire" numeric(8, 2),
	"userId" integer,
	"notes" text,
	"suiviActif" boolean DEFAULT true NOT NULL,
	"typeContrat" "type_contrat",
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicules" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"immatriculation" varchar(20) NOT NULL,
	"marque" varchar(100),
	"modele" varchar(100),
	"annee" integer,
	"typeCarburant" "vehicule_carburant" DEFAULT 'diesel',
	"puissanceFiscale" integer,
	"kilometrageActuel" integer DEFAULT 0,
	"dateAchat" date,
	"prixAchat" numeric(10, 2),
	"technicienId" integer,
	"statut" "vehicule_statut" DEFAULT 'actif',
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activites" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"type" "activite_type" DEFAULT 'autre' NOT NULL,
	"titre" varchar(500) NOT NULL,
	"echeance" date NOT NULL,
	"entiteType" "activite_entite_type" DEFAULT 'aucun',
	"entiteId" integer,
	"responsableUserId" integer,
	"fait" boolean DEFAULT false NOT NULL,
	"faitAt" timestamp,
	"note" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"threadId" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"transcript" text NOT NULL,
	"attachments" jsonb,
	"metadata" jsonb,
	"pricingMetadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"mode" varchar(50) DEFAULT 'general' NOT NULL,
	"parcoursId" varchar(255),
	"title" text NOT NULL,
	"lastMessageAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyses_photos_chantier" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer,
	"titre" varchar(255),
	"description" text,
	"statut" "analyse_statut" DEFAULT 'en_attente',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles_artisan" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"reference" varchar(50) NOT NULL,
	"designation" varchar(500) NOT NULL,
	"description" text,
	"unite" varchar(20) DEFAULT 'unité',
	"prixUnitaireHT" numeric(10, 2) NOT NULL,
	"tauxTVA" numeric(5, 2) DEFAULT '20.00',
	"prixRevientHT" numeric(10, 2),
	"categorie" varchar(100),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles_fournisseurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"articleId" integer NOT NULL,
	"fournisseurId" integer NOT NULL,
	"referenceExterne" varchar(100),
	"prixAchat" numeric(10, 2),
	"delaiLivraison" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avis_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"interventionId" integer,
	"note" integer NOT NULL,
	"commentaire" text,
	"tokenAvis" varchar(64),
	"reponseArtisan" text,
	"reponseAt" timestamp,
	"statut" "avis_statut" DEFAULT 'en_attente',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "avis_clients_tokenAvis_unique" UNIQUE("tokenAvis")
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"nom" varchar(100) NOT NULL,
	"description" text,
	"icone" varchar(50),
	"couleur" varchar(20),
	"categorie" "badge_categorie" DEFAULT 'interventions',
	"condition" text,
	"seuil" integer,
	"points" integer DEFAULT 10,
	"actif" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges_techniciens" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicienId" integer NOT NULL,
	"badgeId" integer NOT NULL,
	"dateObtention" timestamp DEFAULT now() NOT NULL,
	"valeurAtteinte" integer,
	"notifie" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "bibliotheque_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"metier" varchar(50) NOT NULL,
	"categorie" varchar(50) NOT NULL,
	"sous_categorie" varchar(100) NOT NULL,
	"nom" varchar(255) NOT NULL,
	"description" text,
	"prix_base" numeric(10, 2) NOT NULL,
	"unite" varchar(50) NOT NULL,
	"tauxTVA" numeric(5, 2) DEFAULT '20.00',
	"prixRevient" numeric(10, 2),
	"duree_moyenne_minutes" integer,
	"visible" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chantiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"reference" varchar(50) NOT NULL,
	"nom" varchar(255) NOT NULL,
	"description" text,
	"adresse" text,
	"codePostal" varchar(10),
	"ville" varchar(100),
	"dateDebut" date,
	"dateFinPrevue" date,
	"dateFinReelle" date,
	"budgetPrevisionnel" numeric(12, 2),
	"budgetRealise" numeric(12, 2) DEFAULT '0.00',
	"statut" "chantier_statut" DEFAULT 'planifie',
	"avancement" integer DEFAULT 0,
	"priorite" "chantier_priorite" DEFAULT 'normale',
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commandes_fournisseurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"fournisseurId" integer NOT NULL,
	"numero" varchar(20),
	"reference" varchar(50),
	"dateCommande" timestamp DEFAULT now() NOT NULL,
	"dateLivraisonPrevue" timestamp,
	"dateLivraisonReelle" timestamp,
	"statut" "commande_statut" DEFAULT 'brouillon',
	"montantTotal" numeric(10, 2),
	"totalHT" numeric(10, 2),
	"totalTVA" numeric(10, 2),
	"totalTTC" numeric(10, 2),
	"delaiLivraison" varchar(100),
	"adresseLivraison" text,
	"notes" text,
	"statutFacturation" "commande_statut_facturation" DEFAULT 'a_facturer',
	"depenseId" integer,
	"alerteRetardEnvoyee" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_alertes_previsions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"seuilAlertePositif" numeric(5, 2) DEFAULT '10.00',
	"seuilAlerteNegatif" numeric(5, 2) DEFAULT '10.00',
	"alerteEmail" boolean DEFAULT true,
	"alerteSms" boolean DEFAULT false,
	"emailDestination" varchar(320),
	"telephoneDestination" varchar(20),
	"frequenceVerification" "alerte_frequence" DEFAULT 'hebdomadaire',
	"actif" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "config_alertes_previsions_artisanId_unique" UNIQUE("artisanId")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"sujet" varchar(255),
	"statut" "conversation_statut" DEFAULT 'ouverte',
	"devisId" integer,
	"factureId" integer,
	"interventionId" integer,
	"dernierMessage" text,
	"dernierMessageDate" timestamp,
	"nonLuArtisan" integer DEFAULT 0,
	"nonLuClient" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "couleurs_interventions" (
	"artisanId" integer NOT NULL,
	"interventionId" integer NOT NULL,
	"couleur" varchar(20) NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "couleurs_interventions_artisanId_interventionId_pk" PRIMARY KEY("artisanId","interventionId")
);
--> statement-breakpoint
CREATE TABLE "demandes_avis" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"interventionId" integer NOT NULL,
	"tokenDemande" varchar(64) NOT NULL,
	"emailEnvoyeAt" timestamp,
	"avisRecuAt" timestamp,
	"statut" "demande_avis_statut" DEFAULT 'envoyee',
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "demandes_avis_tokenDemande_unique" UNIQUE("tokenDemande")
);
--> statement-breakpoint
CREATE TABLE "demandes_contact" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"nom" varchar(200) NOT NULL,
	"email" varchar(320),
	"telephone" varchar(30),
	"message" text,
	"source" varchar(50) DEFAULT 'vitrine',
	"statut" "demande_contact_statut" DEFAULT 'nouveau',
	"clientId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devis_genere_ia" (
	"id" serial PRIMARY KEY NOT NULL,
	"analyseId" integer NOT NULL,
	"devisId" integer,
	"montantEstime" numeric(12, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents_chantier" (
	"id" serial PRIMARY KEY NOT NULL,
	"chantierId" integer NOT NULL,
	"nom" varchar(255) NOT NULL,
	"type" "document_chantier_type" DEFAULT 'autre',
	"url" text NOT NULL,
	"taille" integer,
	"uploadedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"from_name" text,
	"reply_to" text,
	"attachments" jsonb,
	"tentatives" integer DEFAULT 0 NOT NULL,
	"statut" text DEFAULT 'pending' NOT NULL,
	"derniere_erreur" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"traitee_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "executions_rapports" (
	"id" serial PRIMARY KEY NOT NULL,
	"rapportId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"dateExecution" timestamp DEFAULT now() NOT NULL,
	"parametres" jsonb,
	"resultats" jsonb,
	"nombreLignes" integer DEFAULT 0,
	"tempsExecution" integer
);
--> statement-breakpoint
CREATE TABLE "fournisseurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"nom" varchar(255) NOT NULL,
	"contact" varchar(255),
	"email" varchar(320),
	"telephone" varchar(20),
	"adresse" text,
	"codePostal" varchar(10),
	"ville" varchar(100),
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historique_alertes_previsions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"mois" integer NOT NULL,
	"annee" integer NOT NULL,
	"typeAlerte" "alerte_type" NOT NULL,
	"caPrevisionnel" numeric(12, 2),
	"caRealise" numeric(12, 2),
	"ecartPourcentage" numeric(5, 2),
	"canalEnvoi" "alerte_canal" NOT NULL,
	"dateEnvoi" timestamp DEFAULT now() NOT NULL,
	"statut" "alerte_envoi_statut" DEFAULT 'envoye',
	"message" text
);
--> statement-breakpoint
CREATE TABLE "lignes_commandes_fournisseurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"commandeId" integer NOT NULL,
	"articleId" integer,
	"stockId" integer,
	"designation" varchar(255) NOT NULL,
	"reference" varchar(50),
	"quantite" numeric(10, 2) NOT NULL,
	"quantiteRecue" numeric(10, 2) DEFAULT '0.00',
	"unite" varchar(20) DEFAULT 'unité',
	"prixUnitaire" numeric(10, 2),
	"tauxTVA" numeric(5, 2) DEFAULT '20.00',
	"montantTotal" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"user_id" integer,
	"use_case" varchar(80) NOT NULL,
	"model" varchar(80) NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"text_input_tokens" integer DEFAULT 0 NOT NULL,
	"audio_input_tokens" integer DEFAULT 0 NOT NULL,
	"image_input_tokens" integer DEFAULT 0 NOT NULL,
	"video_input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"tool_use_tokens" integer DEFAULT 0 NOT NULL,
	"response_tokens" integer DEFAULT 0 NOT NULL,
	"text_output_tokens" integer DEFAULT 0 NOT NULL,
	"audio_output_tokens" integer DEFAULT 0 NOT NULL,
	"thinking_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"traffic_type" varchar(30),
	"duration_ms" integer NOT NULL,
	"finish_reason" varchar(20) NOT NULL,
	"input_payload" text,
	"output_payload" text,
	"message_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"auteur" "message_auteur" NOT NULL,
	"contenu" text NOT NULL,
	"lu" boolean DEFAULT false,
	"pieceJointe" text,
	"pieceJointeUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mouvements_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"stockId" integer NOT NULL,
	"type" "mouvement_type" NOT NULL,
	"quantite" numeric(10, 2) NOT NULL,
	"quantiteAvant" numeric(10, 2) NOT NULL,
	"quantiteApres" numeric(10, 2) NOT NULL,
	"motif" text,
	"reference" varchar(100),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"type" "notification_type" DEFAULT 'info',
	"titre" varchar(255) NOT NULL,
	"message" text,
	"lien" varchar(500),
	"lu" boolean DEFAULT false,
	"archived" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phases_chantier" (
	"id" serial PRIMARY KEY NOT NULL,
	"chantierId" integer NOT NULL,
	"nom" varchar(255) NOT NULL,
	"description" text,
	"ordre" integer DEFAULT 1,
	"dateDebutPrevue" date,
	"dateFinPrevue" date,
	"dateDebutReelle" date,
	"dateFinReelle" date,
	"statut" "phase_statut" DEFAULT 'a_faire',
	"avancement" integer DEFAULT 0,
	"budgetPhase" numeric(10, 2),
	"coutReel" numeric(10, 2) DEFAULT '0.00',
	"heuresPrevues" numeric(7, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos_analyse" (
	"id" serial PRIMARY KEY NOT NULL,
	"analyseId" integer NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"ordre" integer DEFAULT 1,
	"uploadedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pointages_chantier" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"chantierId" integer NOT NULL,
	"phaseId" integer,
	"technicienId" integer,
	"date" date NOT NULL,
	"heures" numeric(6, 2) NOT NULL,
	"description" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences_couleurs_calendrier" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"interventionId" integer NOT NULL,
	"couleur" varchar(50) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rapports_personnalises" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"nom" varchar(100) NOT NULL,
	"description" text,
	"type" "rapport_type" NOT NULL,
	"filtres" jsonb,
	"colonnes" jsonb,
	"groupement" varchar(50),
	"tri" varchar(50),
	"format" "rapport_format" DEFAULT 'tableau',
	"graphiqueType" "rapport_graphique_type",
	"favori" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resultats_analyse_ia" (
	"id" serial PRIMARY KEY NOT NULL,
	"analyseId" integer NOT NULL,
	"typeTravauxDetecte" varchar(255),
	"descriptionTravaux" text,
	"urgence" "analyse_urgence" DEFAULT 'moyenne',
	"confiance" numeric(5, 2),
	"rawResponse" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"articleId" integer,
	"articleType" "stock_article_type" DEFAULT 'bibliotheque',
	"reference" varchar(50) NOT NULL,
	"designation" varchar(500) NOT NULL,
	"quantiteEnStock" numeric(10, 2) DEFAULT '0.00',
	"seuilAlerte" numeric(10, 2) DEFAULT '5.00',
	"unite" varchar(20) DEFAULT 'unité',
	"prixAchat" numeric(10, 2),
	"emplacement" varchar(100),
	"fournisseur" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions_articles_ia" (
	"id" serial PRIMARY KEY NOT NULL,
	"resultatId" integer NOT NULL,
	"articleId" integer,
	"nomArticle" varchar(255) NOT NULL,
	"description" text,
	"quantiteSuggeree" numeric(10, 2) DEFAULT '1.00',
	"unite" varchar(20) DEFAULT 'unité',
	"prixEstime" numeric(10, 2),
	"confiance" numeric(5, 2),
	"selectionne" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suivi_chantier" (
	"id" serial PRIMARY KEY NOT NULL,
	"chantierId" integer NOT NULL,
	"titre" varchar(255) NOT NULL,
	"description" text,
	"statut" "suivi_statut" DEFAULT 'a_faire',
	"pourcentage" integer DEFAULT 0,
	"ordre" integer DEFAULT 1,
	"visibleClient" boolean DEFAULT true,
	"dateDebut" date,
	"dateFin" date,
	"commentaire" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factures_cycle_vie_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"factureId" integer NOT NULL,
	"statut" "facture_cycle_vie" NOT NULL,
	"motif" text,
	"source" varchar(30) DEFAULT 'local' NOT NULL,
	"paEventId" varchar(100),
	"occurredAt" timestamp NOT NULL,
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "factures_cycle_vie_events_paEventId_unique" UNIQUE("paEventId")
);
--> statement-breakpoint
CREATE TABLE "factures_entrantes" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"paDocumentId" varchar(100) NOT NULL,
	"emetteurSiret" varchar(14),
	"montantTTC" varchar(20),
	"date" timestamp,
	"facturxBase64" text,
	"fetchedAt" timestamp DEFAULT now() NOT NULL,
	"lu" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fe_artisan_document" UNIQUE("artisanId","paDocumentId")
);
--> statement-breakpoint
CREATE TABLE "pa_entites" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"fournisseur" varchar(50) NOT NULL,
	"paEntityId" varchar(100),
	"statutProvisioning" varchar(30) DEFAULT 'pending',
	"kybStatut" varchar(50),
	"derniereErreur" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pa_entites_artisan_fournisseur" UNIQUE("artisanId","fournisseur")
);
--> statement-breakpoint
CREATE TABLE "pa_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"factureId" integer NOT NULL,
	"statut" varchar(30) DEFAULT 'pending' NOT NULL,
	"tentatives" integer DEFAULT 0,
	"derniereErreur" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"traiteeAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer,
	"storage_key" varchar(500) NOT NULL,
	"filename" varchar(255),
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"purpose" varchar(50) NOT NULL,
	"bucket" varchar(100) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "message_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" varchar(100) NOT NULL,
	"message_index" integer NOT NULL,
	"file_id" integer NOT NULL,
	"artisan_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_lignes" ADD CONSTRAINT "factures_lignes_tvaCategorieId_tva_categories_id_fk" FOREIGN KEY ("tvaCategorieId") REFERENCES "public"."tva_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devis_lignes" ADD CONSTRAINT "devis_lignes_tvaCategorieId_tva_categories_id_fk" FOREIGN KEY ("tvaCategorieId") REFERENCES "public"."tva_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devis_options_lignes" ADD CONSTRAINT "devis_options_lignes_tvaCategorieId_tva_categories_id_fk" FOREIGN KEY ("tvaCategorieId") REFERENCES "public"."tva_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modeles_devis_lignes" ADD CONSTRAINT "modeles_devis_lignes_tvaCategorieId_tva_categories_id_fk" FOREIGN KEY ("tvaCategorieId") REFERENCES "public"."tva_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_recurrentes" ADD CONSTRAINT "factures_recurrentes_contratId_contrats_maintenance_id_fk" FOREIGN KEY ("contratId") REFERENCES "public"."contrats_maintenance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions_contrat" ADD CONSTRAINT "interventions_contrat_contratId_contrats_maintenance_id_fk" FOREIGN KEY ("contratId") REFERENCES "public"."contrats_maintenance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions_mobile" ADD CONSTRAINT "interventions_mobile_interventionId_interventions_id_fk" FOREIGN KEY ("interventionId") REFERENCES "public"."interventions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos_interventions" ADD CONSTRAINT "photos_interventions_interventionMobileId_interventions_mobile_id_fk" FOREIGN KEY ("interventionMobileId") REFERENCES "public"."interventions_mobile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_charge_attempts" ADD CONSTRAINT "billing_charge_attempts_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_invoice_id_billing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."billing_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_payment_method_id_billing_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."billing_payment_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandes_avis" ADD CONSTRAINT "demandes_avis_interventionId_interventions_id_fk" FOREIGN KEY ("interventionId") REFERENCES "public"."interventions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_artisan_id_artisans_id_fk" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_message_id_ai_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_cycle_vie_events" ADD CONSTRAINT "factures_cycle_vie_events_artisanId_artisans_id_fk" FOREIGN KEY ("artisanId") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_cycle_vie_events" ADD CONSTRAINT "factures_cycle_vie_events_factureId_factures_id_fk" FOREIGN KEY ("factureId") REFERENCES "public"."factures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_entrantes" ADD CONSTRAINT "factures_entrantes_artisanId_artisans_id_fk" FOREIGN KEY ("artisanId") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pa_entites" ADD CONSTRAINT "pa_entites_artisanId_artisans_id_fk" FOREIGN KEY ("artisanId") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pa_outbox" ADD CONSTRAINT "pa_outbox_artisanId_artisans_id_fk" FOREIGN KEY ("artisanId") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pa_outbox" ADD CONSTRAINT "pa_outbox_factureId_factures_id_fk" FOREIGN KEY ("factureId") REFERENCES "public"."factures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_artisan_id_artisans_id_fk" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_files" ADD CONSTRAINT "message_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_files" ADD CONSTRAINT "message_files_artisan_id_artisans_id_fk" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_positions_techniciens_expires_at" ON "positions_techniciens" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "email_outbox_pending_idx" ON "email_outbox" USING btree ("statut","created_at") WHERE "email_outbox"."statut" = 'pending';
--> statement-breakpoint
-- ── RLS (isolation multi-tenant + accès public par token) ──────────────────────
-- Non généré par drizzle-kit (RLS hors schéma TS). Extrait de l état appliqué (source: staging).
-- Régénérer une évolution via scripts/rls/generate-tenant-rls.mjs (nouvelle migration append).
ALTER TABLE ONLY public.activites FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.ai_threads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.analyses_photos_chantier FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.articles_artisan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.artisan_modules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.avis_clients FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.badges FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.billing_invoices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.billing_payment_methods FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.budgets_categories FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.categories_depenses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.chantiers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.classement_techniciens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.client_portal_access FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.clients FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.commandes_fournisseurs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.config_alertes_previsions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.config_relances_auto FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.configurations_comptables FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.conges FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.contrats_maintenance FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.conversations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.couleurs_interventions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.demandes_avis FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.demandes_contact FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.depenses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.devis FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.ecritures_comptables FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.emails_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.executions_rapports FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.exports_comptables FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.factures FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.factures_cycle_vie_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.factures_entrantes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.files FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.fournisseurs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.habilitations_techniciens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.historique_alertes_previsions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.historique_ca FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.interventions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.interventions_contrat FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.interventions_mobile FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.interventions_techniciens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.llm_usage FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.message_files FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.modeles_devis FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.modeles_email FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.notes_de_frais FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.objectifs_techniciens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.pa_entites FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.pa_outbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.paiements_stripe FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.parametres_artisan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.plan_comptable FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.pointages_chantier FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.preferences_couleurs_calendrier FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.previsions_ca FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.rapports_personnalises FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.rdv_en_ligne FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.regles_categorisation FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.relances_devis FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.releves_bancaires FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.soldes_conges FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.stocks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.techniciens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.transactions_bancaires FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ONLY public.vehicules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.activites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.ai_threads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.analyses_photos_chantier ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.articles_artisan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.artisan_modules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.avis_clients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.billing_payment_methods ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.budgets_categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.categories_depenses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.chantiers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.classement_techniciens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.client_portal_access ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.commandes_fournisseurs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.config_alertes_previsions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.config_relances_auto ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.configurations_comptables ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.conges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.contrats_maintenance ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.couleurs_interventions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.demandes_avis ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.demandes_contact ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.depenses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.devis ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.ecritures_comptables ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.emails_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.executions_rapports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.exports_comptables ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.factures_cycle_vie_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.factures_entrantes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.habilitations_techniciens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.historique_alertes_previsions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.historique_ca ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.interventions_contrat ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.interventions_mobile ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.interventions_techniciens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.llm_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.message_files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.modeles_devis ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.modeles_email ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.notes_de_frais ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.objectifs_techniciens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.pa_entites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.pa_outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.paiements_stripe ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.parametres_artisan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.plan_comptable ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.pointages_chantier ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.preferences_couleurs_calendrier ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.previsions_ca ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY public_token_select ON public.client_portal_access FOR SELECT USING (((token)::text = NULLIF(current_setting('app.public_token'::text, true), ''::text)));
--> statement-breakpoint
CREATE POLICY public_token_select ON public.demandes_avis FOR SELECT USING ((("tokenDemande")::text = NULLIF(current_setting('app.public_token'::text, true), ''::text)));
--> statement-breakpoint
CREATE POLICY public_token_select ON public.devis FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.signatures_devis s
  WHERE ((s."devisId" = devis.id) AND ((s.token)::text = NULLIF(current_setting('app.public_token'::text, true), ''::text))))));
--> statement-breakpoint
CREATE POLICY public_token_select ON public.paiements_stripe FOR SELECT USING ((("tokenPaiement")::text = NULLIF(current_setting('app.public_token'::text, true), ''::text)));
--> statement-breakpoint
ALTER TABLE public.rapports_personnalises ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.rdv_en_ligne ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.regles_categorisation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.relances_devis ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.releves_bancaires ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.soldes_conges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.techniciens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.activites USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.ai_threads USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.analyses_photos_chantier USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.articles_artisan USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.artisan_modules USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.avis_clients USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.badges USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.billing_invoices USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.billing_payment_methods USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.budgets_categories USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.categories_depenses USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.chantiers USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.classement_techniciens USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.client_portal_access USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.clients USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.commandes_fournisseurs USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.config_alertes_previsions USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.config_relances_auto USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.configurations_comptables USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.conges USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.contrats_maintenance USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.conversations USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.couleurs_interventions USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.demandes_avis USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.demandes_contact USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.depenses USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.devis USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.ecritures_comptables USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.emails_log USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.executions_rapports USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.exports_comptables USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.factures USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.factures_cycle_vie_events USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.factures_entrantes USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.files USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.fournisseurs USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.habilitations_techniciens USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.historique_alertes_previsions USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.historique_ca USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.interventions USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.interventions_contrat USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.interventions_mobile USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.interventions_techniciens USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.llm_usage USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.message_files USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.modeles_devis USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.modeles_email USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.notes_de_frais USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.notifications USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.objectifs_techniciens USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.pa_entites USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.pa_outbox USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.paiements_stripe USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.parametres_artisan USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.plan_comptable USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.pointages_chantier USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.preferences_couleurs_calendrier USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.previsions_ca USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.rapports_personnalises USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.rdv_en_ligne USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.regles_categorisation USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.relances_devis USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.releves_bancaires USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.soldes_conges USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.stocks USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.techniciens USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.transactions_bancaires USING ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK ((artisan_id = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.vehicules USING (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer)) WITH CHECK (("artisanId" = (NULLIF(current_setting('app.tenant'::text, true), ''::text))::integer));
--> statement-breakpoint
ALTER TABLE public.transactions_bancaires ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.vehicules ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
-- ── Contraintes & index custom (CHECK, FK self-ref, index partiels) ────────────
-- Non générés par drizzle-kit (hors schéma TS). Extraits de l état appliqué (staging).
ALTER TABLE "billing_charge_attempts" ADD CONSTRAINT "billing_charge_attempts_status_check" CHECK (((status)::text = ANY ((ARRAY['initiated'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'requires_action'::character varying, 'processing'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_charge_attempts" ADD CONSTRAINT "chk_attempt_status" CHECK (((status)::text = ANY ((ARRAY['initiated'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'requires_action'::character varying, 'processing'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'charging'::character varying, 'requires_action'::character varying, 'processing'::character varying, 'paid'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "chk_cycle_status" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'charging'::character varying, 'requires_action'::character varying, 'processing'::character varying, 'paid'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "chk_line_type" CHECK (((type)::text = ANY ((ARRAY['subscription'::character varying, 'credit_pack'::character varying, 'add_on'::character varying, 'usage'::character varying, 'discount'::character varying, 'credit_note'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "chk_credit_note_ref" CHECK ((((type)::text <> 'credit_note'::text) OR (original_invoice_id IS NOT NULL)));
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "chk_invoice_status" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'open'::character varying, 'paid'::character varying, 'void'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "chk_invoice_type" CHECK (((type)::text = ANY ((ARRAY['subscription'::character varying, 'one_time'::character varying, 'credit_note'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "chk_no_void_paid" CHECK ((NOT (((status)::text = 'void'::text) AND (paid_at IS NOT NULL))));
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "chk_number_finalized" CHECK ((((status)::text = 'draft'::text) OR (number IS NOT NULL)));
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "fk_invoice_original" FOREIGN KEY (original_invoice_id) REFERENCES billing_invoices(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_billing_interval_check" CHECK (((billing_interval)::text = ANY ((ARRAY['monthly'::character varying, 'yearly'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_billing_mode_check" CHECK (((billing_mode)::text = ANY ((ARRAY['maison'::character varying, 'stripe'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_plan_id_check" CHECK (((plan_id)::text = ANY ((ARRAY['starter'::character varying, 'pro'::character varying, 'enterprise'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_status_check" CHECK (((status)::text = ANY ((ARRAY['trialing'::character varying, 'active'::character varying, 'past_due'::character varying, 'canceled'::character varying])::text[])));
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "chk_pm_required" CHECK ((((status)::text <> 'active'::text) OR (payment_method_id IS NOT NULL)));
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "chk_sub_status" CHECK (((status)::text = ANY ((ARRAY['trialing'::character varying, 'active'::character varying, 'past_due'::character varying, 'canceled'::character varying])::text[])));
--> statement-breakpoint
CREATE INDEX files_artisan_id_idx ON public.files USING btree (artisan_id);
--> statement-breakpoint
CREATE INDEX files_deleted_at_idx ON public.files USING btree (deleted_at) WHERE (deleted_at IS NULL);
--> statement-breakpoint
CREATE INDEX files_purpose_idx ON public.files USING btree (purpose);
--> statement-breakpoint
CREATE INDEX files_sha256_idx ON public.files USING btree (sha256);
--> statement-breakpoint
CREATE INDEX idx_artisans_pending_deletion ON public.artisans USING btree ("pendingDeletionAt") WHERE ("pendingDeletionAt" IS NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_attempts_pi ON public.billing_charge_attempts USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_billing_events_entity ON public.billing_events USING btree (entity_type, entity_id, created_at);
--> statement-breakpoint
CREATE INDEX idx_billing_events_time ON public.billing_events USING btree (created_at);
--> statement-breakpoint
CREATE INDEX idx_cycles_charging ON public.billing_cycles USING btree (charging_started_at) WHERE ((status)::text = 'charging'::text);
--> statement-breakpoint
CREATE INDEX idx_cycles_due ON public.billing_cycles USING btree (status, next_retry_at) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'failed'::character varying, 'requires_action'::character varying])::text[]));
--> statement-breakpoint
CREATE INDEX idx_cycles_subscription ON public.billing_cycles USING btree (subscription_id, period_start);
--> statement-breakpoint
CREATE INDEX idx_inv_artisan_status ON public.billing_invoices USING btree (artisan_id, status);
--> statement-breakpoint
CREATE INDEX idx_inv_cycle ON public.billing_invoices USING btree (billing_cycle_id) WHERE (billing_cycle_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_lines_invoice ON public.billing_invoice_lines USING btree (invoice_id);
--> statement-breakpoint
CREATE INDEX idx_llm_usage_artisan_date ON public.llm_usage USING btree (artisan_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_llm_usage_message ON public.llm_usage USING btree (message_id) WHERE (message_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_llm_usage_usecase_date ON public.llm_usage USING btree (use_case, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_notifications_artisan_lu ON public.notifications USING btree ("artisanId", lu, archived) WHERE (archived = false);
--> statement-breakpoint
CREATE INDEX idx_pm_artisan ON public.billing_payment_methods USING btree (artisan_id);
--> statement-breakpoint
CREATE INDEX idx_subs_artisan_status ON public.billing_subscriptions USING btree (artisan_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX uniq_default_pm_per_artisan ON public.billing_payment_methods USING btree (artisan_id) WHERE (is_default = true);
