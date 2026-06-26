ALTER TABLE "users" ADD COLUMN "registrationIp" varchar(64);--> statement-breakpoint
ALTER TABLE "artisans" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;