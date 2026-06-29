ALTER TABLE "factures" ADD COLUMN "estAcompte" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "factures_devisId_estAcompte_idx" ON "factures" ("devisId", "estAcompte") WHERE "devisId" IS NOT NULL;
