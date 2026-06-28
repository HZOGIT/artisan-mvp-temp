ALTER TABLE "transactions_bancaires" ADD COLUMN "facture_id" integer;
--> statement-breakpoint
ALTER TABLE "transactions_bancaires" ADD CONSTRAINT "transactions_bancaires_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "factures"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "idx_transactions_bancaires_facture_id" ON "transactions_bancaires" ("facture_id") WHERE "facture_id" IS NOT NULL;