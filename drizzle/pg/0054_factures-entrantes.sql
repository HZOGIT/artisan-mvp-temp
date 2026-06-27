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
ALTER TABLE "factures_entrantes" ADD CONSTRAINT "factures_entrantes_artisanId_artisans_id_fk" FOREIGN KEY ("artisanId") REFERENCES "public"."artisans"("id") ON DELETE no action ON UPDATE no action;