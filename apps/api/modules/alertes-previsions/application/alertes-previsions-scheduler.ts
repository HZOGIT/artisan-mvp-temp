import type { IAlertesPrevisionsRepository } from "./alertes-previsions-repository";
import { verifierEtEnvoyer } from "./use-cases";

export interface AlertesSchedulerTickResult {
  readonly processed: number;
  readonly errors: number;
}

/**
 * Exécute un tick du scheduler alertes CA : appelle `verifierEtEnvoyer` pour chaque
 * artisanId fourni. Erreurs isolées par artisan — ne rompt pas la boucle.
 */
export async function runAlertesSchedulerTick(
  repo: IAlertesPrevisionsRepository,
  artisanIds: number[],
  now: Date = new Date(),
): Promise<AlertesSchedulerTickResult> {
  let processed = 0;
  let errors = 0;
  for (const artisanId of artisanIds) {
    try {
      await verifierEtEnvoyer(repo, { artisanId, userId: 0 }, now);
      processed++;
    } catch {
      errors++;
    }
  }
  return { processed, errors };
}
