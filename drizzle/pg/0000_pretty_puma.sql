CREATE TYPE "public"."activite_entite_type" AS ENUM('client', 'devis', 'facture', 'chantier', 'aucun');--> statement-breakpoint
CREATE TYPE "public"."activite_type" AS ENUM('appel', 'email', 'rdv', 'relance', 'autre');--> statement-breakpoint
CREATE TYPE "public"."alerte_canal" AS ENUM('email', 'sms', 'les_deux');--> statement-breakpoint
CREATE TYPE "public"."alerte_envoi_statut" AS ENUM('envoye', 'echec', 'lu');--> statement-breakpoint
CREATE TYPE "public"."alerte_frequence" AS ENUM('quotidien', 'hebdomadaire', 'mensuel');--> statement-breakpoint
CREATE TYPE "public"."alerte_type" AS ENUM('depassement_positif', 'depassement_negatif');--> statement-breakpoint
CREATE TYPE "public"."analyse_statut" AS ENUM('en_attente', 'en_cours', 'termine', 'erreur');--> statement-breakpoint
CREATE TYPE "public"."analyse_urgence" AS ENUM('faible', 'moyenne', 'haute', 'critique');--> statement-breakpoint
CREATE TYPE "public"."artisan_specialite" AS ENUM('plomberie', 'electricite', 'chauffage', 'multi-services');--> statement-breakpoint
CREATE TYPE "public"."assurance_type" AS ENUM('tiers', 'tiers_plus', 'tous_risques');--> statement-breakpoint
CREATE TYPE "public"."avis_statut" AS ENUM('en_attente', 'publie', 'masque');--> statement-breakpoint
CREATE TYPE "public"."badge_categorie" AS ENUM('interventions', 'avis', 'ca', 'anciennete', 'special');--> statement-breakpoint
CREATE TYPE "public"."chantier_priorite" AS ENUM('basse', 'normale', 'haute', 'urgente');--> statement-breakpoint
CREATE TYPE "public"."chantier_statut" AS ENUM('planifie', 'en_cours', 'en_pause', 'termine', 'annule');--> statement-breakpoint
CREATE TYPE "public"."classement_periode" AS ENUM('semaine', 'mois', 'trimestre', 'annee');--> statement-breakpoint
CREATE TYPE "public"."client_type" AS ENUM('particulier', 'professionnel');--> statement-breakpoint
CREATE TYPE "public"."commande_statut" AS ENUM('brouillon', 'envoyee', 'confirmee', 'partiellement_livree', 'livree', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."commande_statut_facturation" AS ENUM('a_facturer', 'facturee');--> statement-breakpoint
CREATE TYPE "public"."compta_format_export" AS ENUM('fec', 'iif', 'qbo', 'csv');--> statement-breakpoint
CREATE TYPE "public"."compta_frequence_sync" AS ENUM('quotidien', 'hebdomadaire', 'mensuel', 'manuel');--> statement-breakpoint
CREATE TYPE "public"."compta_logiciel" AS ENUM('sage', 'quickbooks', 'ciel', 'ebp', 'autre');--> statement-breakpoint
CREATE TYPE "public"."compte_type" AS ENUM('actif', 'passif', 'charge', 'produit');--> statement-breakpoint
CREATE TYPE "public"."conge_statut" AS ENUM('en_attente', 'approuve', 'refuse', 'annule');--> statement-breakpoint
CREATE TYPE "public"."conge_type" AS ENUM('conge_paye', 'rtt', 'maladie', 'sans_solde', 'formation', 'autre');--> statement-breakpoint
CREATE TYPE "public"."contrat_periodicite" AS ENUM('mensuel', 'trimestriel', 'semestriel', 'annuel');--> statement-breakpoint
CREATE TYPE "public"."contrat_statut" AS ENUM('actif', 'suspendu', 'termine', 'annule');--> statement-breakpoint
CREATE TYPE "public"."contrat_type" AS ENUM('maintenance_preventive', 'entretien', 'depannage', 'contrat_service');--> statement-breakpoint
CREATE TYPE "public"."conversation_statut" AS ENUM('ouverte', 'fermee', 'archivee');--> statement-breakpoint
CREATE TYPE "public"."delai_paiement_type" AS ENUM('net', 'fin_de_mois');--> statement-breakpoint
CREATE TYPE "public"."demande_avis_statut" AS ENUM('envoyee', 'ouverte', 'completee', 'expiree');--> statement-breakpoint
CREATE TYPE "public"."demande_contact_statut" AS ENUM('nouveau', 'contacte', 'converti', 'perdu');--> statement-breakpoint
CREATE TYPE "public"."devis_statut" AS ENUM('brouillon', 'envoye', 'accepte', 'refuse', 'expire');--> statement-breakpoint
CREATE TYPE "public"."document_chantier_type" AS ENUM('plan', 'photo', 'permis', 'contrat', 'facture', 'autre');--> statement-breakpoint
CREATE TYPE "public"."ecriture_journal" AS ENUM('VE', 'AC', 'BQ', 'OD');--> statement-breakpoint
CREATE TYPE "public"."entretien_type" AS ENUM('vidange', 'pneus', 'freins', 'controle_technique', 'revision', 'reparation', 'autre');--> statement-breakpoint
CREATE TYPE "public"."export_statut" AS ENUM('en_cours', 'termine', 'erreur');--> statement-breakpoint
CREATE TYPE "public"."facture_statut" AS ENUM('brouillon', 'validee', 'envoyee', 'payee', 'en_retard', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."facture_type_document" AS ENUM('facture', 'avoir');--> statement-breakpoint
CREATE TYPE "public"."forme_juridique" AS ENUM('EI', 'micro', 'EURL', 'SARL', 'SAS', 'SASU', 'SA', 'autre');--> statement-breakpoint
CREATE TYPE "public"."intervention_contrat_statut" AS ENUM('planifiee', 'en_cours', 'effectuee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."intervention_statut" AS ENUM('planifiee', 'en_cours', 'terminee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."ligne_type" AS ENUM('produit', 'section', 'note');--> statement-breakpoint
CREATE TYPE "public"."message_auteur" AS ENUM('artisan', 'client');--> statement-breakpoint
CREATE TYPE "public"."mobile_sync_status" AS ENUM('synced', 'pending', 'error');--> statement-breakpoint
CREATE TYPE "public"."modele_email_type" AS ENUM('relance_devis', 'envoi_devis', 'envoi_facture', 'rappel_paiement', 'autre');--> statement-breakpoint
CREATE TYPE "public"."mouvement_type" AS ENUM('entree', 'sortie', 'ajustement');--> statement-breakpoint
CREATE TYPE "public"."notif_push_type" AS ENUM('assignation', 'modification', 'annulation', 'rappel', 'message', 'avis');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('info', 'alerte', 'rappel', 'succes', 'erreur');--> statement-breakpoint
CREATE TYPE "public"."paiement_statut" AS ENUM('en_attente', 'complete', 'echoue', 'rembourse');--> statement-breakpoint
CREATE TYPE "public"."phase_statut" AS ENUM('a_faire', 'en_cours', 'termine', 'annule');--> statement-breakpoint
CREATE TYPE "public"."photo_intervention_type" AS ENUM('avant', 'pendant', 'apres');--> statement-breakpoint
CREATE TYPE "public"."prevision_methode" AS ENUM('moyenne_mobile', 'regression_lineaire', 'saisonnalite', 'manuel');--> statement-breakpoint
CREATE TYPE "public"."rapport_format" AS ENUM('tableau', 'graphique', 'liste');--> statement-breakpoint
CREATE TYPE "public"."rapport_graphique_type" AS ENUM('bar', 'line', 'pie', 'doughnut');--> statement-breakpoint
CREATE TYPE "public"."rapport_type" AS ENUM('ventes', 'clients', 'interventions', 'stocks', 'fournisseurs', 'techniciens', 'financier');--> statement-breakpoint
CREATE TYPE "public"."rdv_statut" AS ENUM('en_attente', 'confirme', 'refuse', 'annule');--> statement-breakpoint
CREATE TYPE "public"."rdv_urgence" AS ENUM('normale', 'urgente', 'tres_urgente');--> statement-breakpoint
CREATE TYPE "public"."relance_statut" AS ENUM('envoye', 'echec');--> statement-breakpoint
CREATE TYPE "public"."relance_type" AS ENUM('email', 'notification');--> statement-breakpoint
CREATE TYPE "public"."signature_statut" AS ENUM('en_attente', 'accepte', 'refuse');--> statement-breakpoint
CREATE TYPE "public"."solde_conge_type" AS ENUM('conge_paye', 'rtt');--> statement-breakpoint
CREATE TYPE "public"."stock_article_type" AS ENUM('bibliotheque', 'artisan');--> statement-breakpoint
CREATE TYPE "public"."suivi_statut" AS ENUM('a_faire', 'en_cours', 'termine');--> statement-breakpoint
CREATE TYPE "public"."technicien_statut" AS ENUM('actif', 'inactif', 'conge');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'artisan', 'secretaire', 'technicien');--> statement-breakpoint
CREATE TYPE "public"."vehicule_carburant" AS ENUM('essence', 'diesel', 'electrique', 'hybride', 'gpl');--> statement-breakpoint
CREATE TYPE "public"."vehicule_statut" AS ENUM('actif', 'en_maintenance', 'hors_service', 'vendu');--> statement-breakpoint
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
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artisans_userId_unique" UNIQUE("userId"),
	CONSTRAINT "artisans_slug_unique" UNIQUE("slug")
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
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"userId" integer NOT NULL,
	"entityType" varchar(50) NOT NULL,
	"entityId" integer NOT NULL,
	"action" varchar(50) NOT NULL,
	"details" text,
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
	"prochainFacturation" timestamp,
	"prochainPassage" timestamp,
	"conditionsParticulieres" text,
	"statut" "contrat_statut" DEFAULT 'actif',
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "devis_genere_ia" (
	"id" serial PRIMARY KEY NOT NULL,
	"analyseId" integer NOT NULL,
	"devisId" integer,
	"montantEstime" numeric(12, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL
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
	"montantHT" numeric(10, 2) DEFAULT '0.00',
	"montantTVA" numeric(10, 2) DEFAULT '0.00',
	"montantTTC" numeric(10, 2) DEFAULT '0.00',
	"type" "ligne_type" DEFAULT 'produit'
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
	"ordre" integer DEFAULT 1
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
	"createdAt" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "factures" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"devisId" integer,
	"numero" varchar(50) NOT NULL,
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
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factures_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"factureId" integer NOT NULL,
	"ordre" integer DEFAULT 0,
	"reference" varchar(50),
	"designation" varchar(500) NOT NULL,
	"description" text,
	"quantite" numeric(10, 2) DEFAULT '1.00',
	"unite" varchar(20) DEFAULT 'unité',
	"prixUnitaireHT" numeric(10, 2) NOT NULL,
	"tauxTVA" numeric(5, 2) DEFAULT '20.00',
	"montantHT" numeric(10, 2) DEFAULT '0.00',
	"montantTVA" numeric(10, 2) DEFAULT '0.00',
	"montantTTC" numeric(10, 2) DEFAULT '0.00',
	"type" "ligne_type" DEFAULT 'produit'
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
	"ordre" integer DEFAULT 1,
	"createdAt" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "permissions_utilisateur" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"permission" varchar(50) NOT NULL,
	"autorise" boolean DEFAULT true NOT NULL,
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
CREATE TABLE "sessions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"expiresAt" bigint NOT NULL
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
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
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
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
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
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;