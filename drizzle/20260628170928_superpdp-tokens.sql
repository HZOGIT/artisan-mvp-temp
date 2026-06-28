CREATE TABLE "superpdp_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"accessToken" text NOT NULL,
	"refreshToken" text,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "superpdp_tokens_artisanId_unique" UNIQUE("artisanId")
);
--> statement-breakpoint
ALTER TABLE "superpdp_tokens" ADD CONSTRAINT "superpdp_tokens_artisanId_artisans_id_fk" FOREIGN KEY ("artisanId") REFERENCES "public"."artisans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "superpdp_tokens_artisan_id_idx" ON "superpdp_tokens" USING btree ("artisanId");
--> statement-breakpoint
alter table "superpdp_tokens" enable row level security;
alter table "superpdp_tokens" force row level security;
drop policy if exists tenant_isolation on "superpdp_tokens";
create policy tenant_isolation on "superpdp_tokens" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);