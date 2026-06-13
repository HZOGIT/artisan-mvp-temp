CREATE TYPE "public"."depense_frequence" AS ENUM('mensuelle', 'trimestrielle', 'annuelle');--> statement-breakpoint
CREATE TYPE "public"."depense_mode_paiement" AS ENUM('carte', 'especes', 'virement', 'cheque', 'prelevement');--> statement-breakpoint
CREATE TYPE "public"."depense_statut" AS ENUM('brouillon', 'soumise', 'approuvee', 'rejetee', 'remboursee');--> statement-breakpoint
CREATE TYPE "public"."ndf_statut" AS ENUM('brouillon', 'soumise', 'approuvee', 'rejetee', 'payee');--> statement-breakpoint
CREATE TYPE "public"."releve_statut" AS ENUM('en_cours', 'termine', 'erreur');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TABLE "artisan_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisan_id" integer NOT NULL,
	"module_slug" varchar(50) NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"activated_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_artisan_module" UNIQUE("artisan_id","module_slug")
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
CREATE TABLE "couleurs_interventions" (
	"artisanId" integer NOT NULL,
	"interventionId" integer NOT NULL,
	"couleur" varchar(20) NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "couleurs_interventions_artisanId_interventionId_pk" PRIMARY KEY("artisanId","interventionId")
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
ALTER TABLE "artisans" ADD COLUMN "metier" varchar(100);--> statement-breakpoint
ALTER TABLE "artisans" ADD COLUMN "plan" varchar(20) DEFAULT 'essentiel';--> statement-breakpoint
ALTER TABLE "artisans" ADD COLUMN "onboarding_completed" boolean DEFAULT false;