/**
 * Définition d'un job idempotent enregistrable dans le scheduler.
 * `periodKey(now)` détermine la clé d'unicité pour une exécution donnée
 * (ex. quotidien → "2026-06-29", mensuel → "2026-06", hebdo → "2026-W26").
 */
export interface JobDefinition {
  readonly name: string;
  readonly periodKey: (now: Date) => string;
  readonly run: () => Promise<void>;
}

export type JobRunResult = "skipped" | "done" | "failed";

/** Helpers de clé de période standard. */
export function dailyKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthlyKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function weeklyKey(d: Date): string {
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - dow);
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 864e5 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
