CREATE TABLE "pieces_jointes" (
  "id"          serial PRIMARY KEY,
  "artisan_id"  integer NOT NULL REFERENCES "artisans"("id"),
  "file_id"     integer NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
  "devis_id"    integer REFERENCES "devis"("id") ON DELETE CASCADE,
  "facture_id"  integer REFERENCES "factures"("id") ON DELETE CASCADE,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pieces_jointes_doc_check" CHECK (
    "devis_id" IS NOT NULL OR "facture_id" IS NOT NULL
  )
);

CREATE INDEX "pieces_jointes_artisan_devis_idx"   ON "pieces_jointes" ("artisan_id", "devis_id")   WHERE "devis_id"   IS NOT NULL;
CREATE INDEX "pieces_jointes_artisan_facture_idx" ON "pieces_jointes" ("artisan_id", "facture_id") WHERE "facture_id" IS NOT NULL;

ALTER TABLE "pieces_jointes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pieces_jointes_tenant_isolation" ON "pieces_jointes"
  USING ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int)
  WITH CHECK ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);
