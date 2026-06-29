import { pgTable, pgEnum, serial, varchar, timestamp } from "drizzle-orm/pg-core";

export const jobRunStatusEnum = pgEnum("job_run_status", ["running", "done", "failed"]);

/**
 * Table de verrou/curseur d'exécution des jobs du scheduler.
 * Infra globale (pas de artisanId / RLS) — isolation par (job_name, period_key).
 * INSERT ON CONFLICT DO NOTHING = mécanisme d'idempotence partagé.
 */
export const schedulerJobRuns = pgTable("scheduler_job_runs", {
  id: serial("id").primaryKey(),
  jobName: varchar("job_name", { length: 100 }).notNull(),
  periodKey: varchar("period_key", { length: 50 }).notNull(),
  status: jobRunStatusEnum("status").notNull().default("running"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  errorMessage: varchar("error_message", { length: 500 }),
});

export type SchedulerJobRun = typeof schedulerJobRuns.$inferSelect;
export type InsertSchedulerJobRun = typeof schedulerJobRuns.$inferInsert;
