ALTER TABLE "factures" ADD COLUMN "pdfFileId" integer REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE "factures" ADD COLUMN "pdfStorageKey" varchar(500);

CREATE INDEX "idx_factures_pdf_file_id" ON "factures" ("pdfFileId") WHERE "pdfFileId" IS NOT NULL;