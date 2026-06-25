ALTER TABLE "positions_techniciens" ADD COLUMN "expiresAt" timestamp;--> statement-breakpoint
ALTER TABLE "techniciens" ADD COLUMN "suiviActif" boolean DEFAULT true NOT NULL;