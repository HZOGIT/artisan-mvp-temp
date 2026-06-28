ALTER TABLE "parametres_artisan" ADD COLUMN "rappelRdvClientActif" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "interventions" ADD COLUMN "rappelClientEnvoye" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "interventions" ADD COLUMN "dateRappelClient" timestamp;
