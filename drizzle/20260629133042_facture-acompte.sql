ALTER TABLE "factures" ADD COLUMN "estAcompte" boolean NOT NULL DEFAULT false;

CREATE INDEX "factures_devisId_estAcompte_idx" ON "factures" ("devisId", "estAcompte") WHERE "devisId" IS NOT NULL;
