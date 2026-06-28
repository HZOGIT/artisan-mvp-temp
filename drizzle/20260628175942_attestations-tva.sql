CREATE TYPE "public"."attestations_tva_statut" AS ENUM('genere', 'signe');

CREATE TABLE "attestations_tva" (
  "id" serial PRIMARY KEY NOT NULL,
  "artisanId" integer NOT NULL,
  "factureId" integer,
  "devisId" integer,
  "s3Key" varchar(500) NOT NULL,
  "signedS3Key" varchar(500),
  "statut" "attestations_tva_statut" DEFAULT 'genere' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "attestations_tva"
  ADD CONSTRAINT "attestations_tva_factureId_factures_id_fk"
  FOREIGN KEY ("factureId") REFERENCES "public"."factures"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "attestations_tva"
  ADD CONSTRAINT "attestations_tva_devisId_devis_id_fk"
  FOREIGN KEY ("devisId") REFERENCES "public"."devis"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "attestations_tva_artisanId_idx" ON "attestations_tva" ("artisanId");
CREATE INDEX "attestations_tva_factureId_idx" ON "attestations_tva" ("factureId");
CREATE INDEX "attestations_tva_devisId_idx" ON "attestations_tva" ("devisId");

ALTER TABLE "attestations_tva" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attestations_tva" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "attestations_tva";
CREATE POLICY tenant_isolation ON "attestations_tva"
  USING ("artisanId" = nullif(current_setting('app.tenant', true), '')::int)
  WITH CHECK ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);