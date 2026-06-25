ALTER TABLE "positions_techniciens" ADD COLUMN "expiresAt" timestamp;--> statement-breakpoint
ALTER TABLE "techniciens" ADD COLUMN "suiviActif" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_positions_techniciens_expires_at" ON "positions_techniciens" USING btree ("expiresAt");