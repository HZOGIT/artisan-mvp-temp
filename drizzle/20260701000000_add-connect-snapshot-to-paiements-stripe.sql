ALTER TABLE "paiements_stripe" ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" varchar(255);--> statement-breakpoint
ALTER TABLE "paiements_stripe" ADD COLUMN IF NOT EXISTS "stripe_charge_id" varchar(255);
