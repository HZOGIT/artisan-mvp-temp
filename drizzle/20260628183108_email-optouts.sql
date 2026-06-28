CREATE TABLE "email_optouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_optouts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
-- ponytail: RLS désactivée — table plateforme-level (opt-out global par email, pas par tenant).
-- Même logique que `events` : journal global, pas de scoping artisanId.
-- Les GRANTs sont gérés par provision-database.ts (réassure app_tenant après chaque migrate()).
ALTER TABLE "email_optouts" DISABLE ROW LEVEL SECURITY;
