import type { IContratRepository } from "./contrat-repository";
import type { ContratFactureGenerator } from "./contrat-facture-generator";
import type { JobDefinition } from "../../../platform/scheduler";
import { dailyKey } from "../../../platform/scheduler";
import { autoGenererFacturesContrats } from "./auto-facturation-use-cases";

/**
 * Job idempotent de génération des factures récurrentes/contrats.
 * Période = journée ISO (dailyKey) — la clé scheduler_job_runs garantit
 * qu'un seul replica l'exécute par jour. L'idempotence par contrat/période
 * est assurée au niveau métier (genererFactureContrat → ConflictError si
 * prochainFacturation non atteinte).
 */
export function makeFacturesRecurrentesJob(
  repo: IContratRepository,
  factureGen: ContratFactureGenerator,
  getArtisanIds: () => Promise<number[]>,
): JobDefinition {
  return {
    name: "factures-recurrentes",
    periodKey: dailyKey,
    async run() {
      const ids = await getArtisanIds();
      await autoGenererFacturesContrats(repo, factureGen, ids, new Date());
    },
  };
}
