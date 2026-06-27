CREATE TABLE "email_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"from_name" text,
	"reply_to" text,
	"attachments" jsonb,
	"tentatives" integer DEFAULT 0 NOT NULL,
	"statut" text DEFAULT 'pending' NOT NULL,
	"derniere_erreur" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"traitee_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "email_outbox_pending_idx" ON "email_outbox" USING btree ("statut","created_at") WHERE "email_outbox"."statut" = 'pending';