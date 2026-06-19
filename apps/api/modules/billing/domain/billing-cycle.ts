export type CycleStatus =
  | "pending"
  | "charging"
  | "requires_action"
  | "processing"
  | "paid"
  | "failed"
  | "skipped";

export interface BillingCycle {
  readonly id: number;
  readonly subscription_id: number;
  readonly period_start: Date;
  readonly period_end: Date;
  readonly amount_cents: number;
  readonly currency: string;
  readonly status: string;
  readonly charging_started_at: Date | null;
  readonly attempt_count: number;
  readonly next_retry_at: Date | null;
  readonly paid_at: Date | null;
  readonly failed_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const ZOMBIE_THRESHOLD_MS = 15 * 60 * 1000;

/** Un cycle est zombie si bloqué en `charging` depuis plus de 15 min (PI perdu, timeout réseau). */
export function isZombie(cycle: BillingCycle, now: Date): boolean {
  if (cycle.status !== "charging" || !cycle.charging_started_at) return false;
  return now.getTime() - cycle.charging_started_at.getTime() > ZOMBIE_THRESHOLD_MS;
}

/** Le cycle doit être prélevé maintenant (pending ou failed avec retry échu). */
export function isDue(cycle: BillingCycle, now: Date): boolean {
  if (cycle.status === "pending") return true;
  if (cycle.status === "failed" && cycle.next_retry_at !== null) {
    return now >= cycle.next_retry_at!;
  }
  return false;
}

const RETRY_DELAYS_MS = [0, 24 * 3600_000, 3 * 24 * 3600_000, 7 * 24 * 3600_000];

/** Calcule la prochaine tentative selon le plan de dunning (J+0, J+1, J+3, J+7). */
export function nextRetryAt(failedAt: Date, attemptCount: number): Date | null {
  const delayIdx = Math.min(attemptCount, RETRY_DELAYS_MS.length - 1);
  const delayMs = RETRY_DELAYS_MS[delayIdx];
  if (delayMs === undefined) return null;
  return new Date(failedAt.getTime() + delayMs);
}
