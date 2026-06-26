CREATE TYPE "public"."facture_cycle_vie" AS ENUM('non_soumise', 'deposee', 'emise', 'recue', 'mise_a_dispo', 'prise_en_charge', 'approuvee', 'en_litige', 'refusee', 'rejetee', 'encaissee', 'paiement_transmis');--> statement-breakpoint
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
ALTER TABLE "factures" ADD COLUMN "statutCycleVie" "facture_cycle_vie" DEFAULT 'non_soumise';--> statement-breakpoint
ALTER TABLE "factures" ADD COLUMN "paId" varchar(100);--> statement-breakpoint
ALTER TABLE "factures" ADD COLUMN "paDocumentId" varchar(100);--> statement-breakpoint
ALTER TABLE "factures" ADD COLUMN "paFormat" varchar(50);--> statement-breakpoint
ALTER TABLE "factures_cycle_vie_events" ADD CONSTRAINT "factures_cycle_vie_events_artisanId_artisans_id_fk" FOREIGN KEY ("artisanId") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_cycle_vie_events" ADD CONSTRAINT "factures_cycle_vie_events_factureId_factures_id_fk" FOREIGN KEY ("factureId") REFERENCES "public"."factures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pa_entites" ADD CONSTRAINT "pa_entites_artisanId_artisans_id_fk" FOREIGN KEY ("artisanId") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pa_outbox" ADD CONSTRAINT "pa_outbox_artisanId_artisans_id_fk" FOREIGN KEY ("artisanId") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pa_outbox" ADD CONSTRAINT "pa_outbox_factureId_factures_id_fk" FOREIGN KEY ("factureId") REFERENCES "public"."factures"("id") ON DELETE no action ON UPDATE no action;