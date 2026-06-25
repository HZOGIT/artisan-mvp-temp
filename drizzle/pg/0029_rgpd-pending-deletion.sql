-- Custom SQL migration file, put your code below! --
ALTER TABLE "artisans" ADD COLUMN IF NOT EXISTS "pendingDeletionAt" timestamp;

CREATE INDEX IF NOT EXISTS idx_artisans_pending_deletion
  ON artisans ("pendingDeletionAt")
  WHERE "pendingDeletionAt" IS NOT NULL;