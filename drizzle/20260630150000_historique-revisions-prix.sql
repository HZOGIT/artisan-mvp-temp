CREATE TABLE "historique_revisions_prix" (
  "id" serial PRIMARY KEY,
  "contratId" integer NOT NULL,
  "artisanId" integer NOT NULL,
  "ancienMontantHT" numeric(10, 2) NOT NULL,
  "nouveauMontantHT" numeric(10, 2) NOT NULL,
  "tauxApplique" numeric(5, 2) NOT NULL,
  "dateRevision" timestamp DEFAULT now() NOT NULL,
  "declencheur" varchar(20) NOT NULL DEFAULT 'manuel',
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "historique_revisions_prix_contratId_fk"
    FOREIGN KEY ("contratId") REFERENCES "contrats_maintenance"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "idx_historique_revisions_contrat" ON "historique_revisions_prix" ("contratId");
--> statement-breakpoint
CREATE INDEX "idx_historique_revisions_artisan" ON "historique_revisions_prix" ("artisanId");
--> statement-breakpoint
ALTER TABLE "historique_revisions_prix" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historique_revisions_prix" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "historique_revisions_prix_tenant_isolation" ON "historique_revisions_prix"
  USING ("artisanId" = nullif(current_setting('app.tenant', true), '')::int)
  WITH CHECK ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);
