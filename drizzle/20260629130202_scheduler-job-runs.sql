CREATE TYPE "public"."job_run_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "scheduler_job_runs" (
	"id"            serial PRIMARY KEY NOT NULL,
	"job_name"      varchar(100) NOT NULL,
	"period_key"    varchar(50)  NOT NULL,
	"status"        "job_run_status" DEFAULT 'running' NOT NULL,
	"started_at"    timestamp DEFAULT now() NOT NULL,
	"completed_at"  timestamp,
	"error_message" varchar(500)
);--> statement-breakpoint

ALTER TABLE "scheduler_job_runs"
  ADD CONSTRAINT "scheduler_job_runs_unique"
  UNIQUE ("job_name", "period_key");--> statement-breakpoint

CREATE INDEX "scheduler_job_runs_job_name_idx"
  ON "scheduler_job_runs" ("job_name");--> statement-breakpoint

/* ponytail: pas de RLS — table infra globale (pas d'artisanId), isolation par (job_name, period_key) */
