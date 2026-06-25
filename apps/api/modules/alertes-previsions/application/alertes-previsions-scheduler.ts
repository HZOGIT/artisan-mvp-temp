import type { IAlertesPrevisionsRepository } from "./alertes-previsions-repository";
import { verifierEtEnvoyer } from "./use-cases";

export interface AlertesSchedulerTickResult {
  readonly processed: number;
  readonly errors: number;
}

export interface AlertesSchedulerLogger {
  error(obj: object, msg: string): void;
}

/**
 * Exécute un tick du scheduler alertes CA : appelle `verifierEtEnvoyer` pour chaque
 * artisanId fourni. Erreurs isolées par artisan — ne rompt pas la boucle.
 */
export async function runAlertesSchedulerTick(
  repo: IAlertesPrevisionsRepository,
  artisanIds: number[],
  now: Date = new Date(),
  log?: AlertesSchedulerLogger,
): Promise<AlertesSchedulerTickResult> {
  let processed = 0;
  let errors = 0;
  for (const artisanId of artisanIds) {
    try {
      await verifierEtEnvoyer(repo, { artisanId, userId: 0 }, now);
      processed++;
    } catch (err) {
      errors++;
      log?.error(
        { event: "alerte_ca_artisan_failed", artisanId, err: err instanceof Error ? err.message : String(err) },
        "Echec alertes CA pour artisan",
      );
    }
  }
  return { processed, errors };
}
