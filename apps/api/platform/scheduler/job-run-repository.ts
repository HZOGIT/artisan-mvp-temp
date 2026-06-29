/** Résultat d'une tentative de claim (INSERT réussi = run autorisé). */
export interface ClaimedRun {
  readonly id: number;
}

/**
 * Port du repository de verrous/curseurs d'exécution.
 * `tryClaimRun` = INSERT ON CONFLICT DO NOTHING → idempotence partagée multi-process.
 */
export interface IJobRunRepository {
  /**
   * Tente d'obtenir le droit d'exécution pour (jobName, periodKey).
   * Renvoie `null` si une exécution existe déjà (running ou done ou failed).
   */
  tryClaimRun(jobName: string, periodKey: string, now: Date): Promise<ClaimedRun | null>;
  markDone(id: number, completedAt: Date): Promise<void>;
  markFailed(id: number, completedAt: Date, errorMessage: string): Promise<void>;
}
