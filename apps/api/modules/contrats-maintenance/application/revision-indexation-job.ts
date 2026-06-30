import { dailyKey } from "../../../platform/scheduler/scheduler-types";
import type { JobDefinition } from "../../../platform/scheduler/scheduler-types";
import { reviserPrixContrat } from "./revision-use-cases";
import { ConflictError, ValidationError } from "../../../shared/errors";
import type { IContratRepository } from "./contrat-repository";

export interface RevisionIndexationJobDeps {
  /** Renvoie tous les artisanIds actifs (table artisans, hors RLS). */
  readonly listArtisanIds: () => Promise<number[]>;
  readonly contratRepo: IContratRepository;
  /** Injectable pour les tests — évite le mocking global de Date. */
  readonly getToday?: () => Date;
}

function anniversaireAtteint(dateDebut: Date, today: Date): boolean {
  const anniversaire = new Date(today.getFullYear(), dateDebut.getMonth(), dateDebut.getDate());
  return today >= anniversaire;
}

/**
 * Job daily d'indexation annuelle des contrats de maintenance.
 * Pour chaque contrat actif éligible (tauxIndexationAnnuel > 0) dont l'anniversaire est atteint
 * dans l'année courante, applique la révision de prix.
 * Idempotent : la garde SQL de {@link reviserPrixContrat} lève {@link ConflictError}
 * si le contrat a déjà été révisé dans l'année courante — rejouer le job ne double jamais l'indexation.
 */
export function createRevisionIndexationJob(deps: RevisionIndexationJobDeps): JobDefinition {
  return {
    name: "revision-indexation-annuelle",
    periodKey: dailyKey,
    async run() {
      const today = (deps.getToday ?? (() => new Date()))();
      const artisanIds = await deps.listArtisanIds();
      for (const artisanId of artisanIds) {
        const ctx = { artisanId, userId: 0 };
        const contrats = await deps.contratRepo.list(ctx);
        for (const c of contrats) {
          if (c.statut !== "actif") continue;
          if (!c.tauxIndexationAnnuel || parseFloat(c.tauxIndexationAnnuel) <= 0) continue;
          if (!anniversaireAtteint(c.dateDebut, today)) continue;
          try {
            await reviserPrixContrat(deps.contratRepo, ctx, c.id);
          } catch (e) {
            if (e instanceof ConflictError || e instanceof ValidationError) continue;
            throw e;
          }
        }
      }
    },
  };
}
