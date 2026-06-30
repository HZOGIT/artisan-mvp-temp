ALTER TABLE "demandes_contact" ADD COLUMN IF NOT EXISTS "consentementAt" timestamp;
ALTER TABLE "demandes_contact" ADD COLUMN IF NOT EXISTS "consentementIp" varchar(64);
ALTER TABLE "demandes_contact" ADD COLUMN IF NOT EXISTS "consentementTexte" text;
