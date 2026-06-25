ALTER TABLE "signatures_devis" ADD COLUMN "documentHash" varchar(64);--> statement-breakpoint
ALTER TABLE "signatures_devis" ADD COLUMN "documentHashedAt" timestamp;