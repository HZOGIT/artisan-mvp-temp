import { dailyKey } from "../../../platform/scheduler/scheduler-types";
import type { JobDefinition } from "../../../platform/scheduler/scheduler-types";
import { autoGenererFacturesContrats } from "./auto-facturation-use-cases";
import type { IContratRepository } from "./contrat-repository";
import type { ContratFactureGenerator } from "./contrat-facture-generator";
import type { DbClient } from "../../../shared/db";

export interface FacturesRecurrentesJobDeps {
  /** Renvoie tous les artisanIds actifs (table artisans, hors RLS). */
  readonly listArtisanIds: () => Promise<number[]>;
  readonly contratRepo: IContratRepository;
  readonly factureGen: ContratFactureGenerator;
  readonly db?: DbClient;
}

/**
 * Job idempotent de facturation récurrente — clé daily (au plus un claim par jour par le scheduler).
 * Anti double-billing : {@link autoGenererFacturesContrats} délègue à {@link genererFactureContrat}
 * qui lève {@link ConflictError} si `prochainFacturation` n'est pas encore atteinte (contrat déjà facturé
 * pour la période courante). Rejouer un tick ne génère jamais de doublon de facture.
 */
export function createFacturesRecurrentesJob(deps: FacturesRecurrentesJobDeps): JobDefinition {
  return {
    name: "factures-recurrentes",
    periodKey: dailyKey,
    async run() {
      const artisanIds = await deps.listArtisanIds();
      await autoGenererFacturesContrats(deps.contratRepo, deps.factureGen, artisanIds, new Date(), deps.db);
    },
  };
}
