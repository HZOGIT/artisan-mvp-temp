ALTER TABLE "interventions" ADD COLUMN "avisDemandeEnvoye" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "interventions" ADD COLUMN "avisDemandeEnvoyeAt" timestamp;
