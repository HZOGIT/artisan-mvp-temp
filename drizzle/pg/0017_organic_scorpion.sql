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
ALTER TABLE "artisans" ADD COLUMN "franchiseTVA" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "devis_lignes" ADD COLUMN "tvaCategorieId" varchar(30);--> statement-breakpoint
ALTER TABLE "factures_lignes" ADD COLUMN "tvaCategorieId" varchar(30);--> statement-breakpoint
ALTER TABLE "devis_lignes" ADD CONSTRAINT "devis_lignes_tvaCategorieId_tva_categories_id_fk" FOREIGN KEY ("tvaCategorieId") REFERENCES "public"."tva_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures_lignes" ADD CONSTRAINT "factures_lignes_tvaCategorieId_tva_categories_id_fk" FOREIGN KEY ("tvaCategorieId") REFERENCES "public"."tva_categories"("id") ON DELETE no action ON UPDATE no action;