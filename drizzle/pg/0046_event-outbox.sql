CREATE TABLE "event_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"artisanId" integer NOT NULL,
	"userId" integer,
	"entityType" varchar(64) NOT NULL,
	"entityId" integer NOT NULL,
	"action" varchar(128) NOT NULL,
	"payload" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
