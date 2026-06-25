export const MAX_DUNNING_ATTEMPTS = 4;

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
const PROCESSING_TIMEOUT_MS = 72 * 3600_000;

/** Un cycle est zombie si bloqué en `charging` depuis plus de 15 min (PI perdu, timeout réseau). */
export function isZombie(cycle: BillingCycle, now: Date): boolean {
  if (cycle.status !== "charging" || !cycle.charging_started_at) return false;
  return now.getTime() - cycle.charging_started_at.getTime() > ZOMBIE_THRESHOLD_MS;
}

/**
 * Un cycle `processing` bloqué depuis plus de 72h doit être réconcilié avec Stripe —
 * les virements SEPA/iDEAL peuvent prendre jusqu'à 3 jours, au-delà c'est suspect.
 */
export function isStuckProcessing(cycle: BillingCycle, now: Date): boolean {
  if (cycle.status !== "processing" || !cycle.charging_started_at) return false;
  return now.getTime() - cycle.charging_started_at.getTime() > PROCESSING_TIMEOUT_MS;
}

/** Le cycle doit être prélevé maintenant (pending avec period_start échu, ou failed avec retry échu). */
export function isDue(cycle: BillingCycle, now: Date): boolean {
  if (cycle.status === "pending") return now >= cycle.period_start;
  if (cycle.status === "failed" && cycle.next_retry_at !== null) {
    return now >= cycle.next_retry_at;
  }
  return false;
}

/**
 * Calcule les dates de la période suivante (monthly = +1 mois, yearly = +1 an).
 * Pour "monthly" : clamp au dernier jour du mois cible pour éviter le débordement
 * de setMonth() sur les jours 29-31 (ex: Jan 31 + 1 mois → Fév 28, pas Mar 3).
 */
export function nextPeriod(periodEnd: Date, interval: "monthly" | "yearly"): { start: Date; end: Date } {
  const start = new Date(periodEnd);
  const end = new Date(periodEnd);
  const anchorDay = periodEnd.getDate();
  if (interval === "yearly") {
    /*
     * setDate(1) avant setFullYear : même pattern que monthly (FIX-G) pour éviter
     * le débordement Feb 29 → Mar 1 lors du passage à une année non-bissextile.
     */
    end.setDate(1);
    end.setFullYear(end.getFullYear() + 1);
    const lastDayOfTargetMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    end.setDate(Math.min(anchorDay, lastDayOfTargetMonth));
  } else {
    end.setDate(1);
    end.setMonth(end.getMonth() + 1);
    const lastDayOfTargetMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    end.setDate(Math.min(anchorDay, lastDayOfTargetMonth));
  }
  return { start, end };
}

const RETRY_DELAYS_MS = [0, 24 * 3600_000, 3 * 24 * 3600_000, 7 * 24 * 3600_000];

/** Calcule la prochaine tentative selon le plan de dunning (J+0, J+1, J+3, J+7). */
export function nextRetryAt(failedAt: Date, attemptCount: number): Date | null {
  const delayIdx = Math.min(attemptCount, RETRY_DELAYS_MS.length - 1);
  const delayMs = RETRY_DELAYS_MS[delayIdx];
  if (delayMs === undefined) return null;
  return new Date(failedAt.getTime() + delayMs);
}
