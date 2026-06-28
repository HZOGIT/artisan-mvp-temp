CREATE TYPE "public"."reglement_mode" AS ENUM('cheque', 'virement', 'especes', 'carte', 'autre');--> statement-breakpoint
CREATE TABLE "reglements" (
	"id" serial PRIMARY KEY NOT NULL,
	"factureId" integer NOT NULL,
	"artisanId" integer NOT NULL,
	"montant" numeric(10, 2) NOT NULL,
	"date" date NOT NULL,
	"mode" "reglement_mode" NOT NULL,
	"reference" varchar(100),
	"note" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reglements" ADD CONSTRAINT "reglements_factureId_factures_id_fk" FOREIGN KEY ("factureId") REFERENCES "public"."factures"("id") ON DELETE cascade ON UPDATE no action;