import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import type { ContratFactureGenerator } from "./contrat-facture-generator";
import { genererFactureContrat } from "./interventions-use-cases";
import type { DbClient } from "../../../shared/db";
import { withOutbox } from "../../../shared/events/with-outbox";
import { outboxEvent } from "../../../shared/events/outbox-event";

export async function autoGenererFacturesContrats(
  repo: IContratRepository,
  factureGen: ContratFactureGenerator,
  artisanIds: number[],
  now: Date = new Date(),
  db?: DbClient,
): Promise<{ generees: number; erreurs: number }> {
  let generees = 0;
  let erreurs = 0;
  for (const artisanId of artisanIds) {
    const ctx: TenantContext = { artisanId, userId: 0 };
    const aFacturer = await repo.listAFacturer(ctx);
    for (const contrat of aFacturer) {
      try {
        await withOutbox(db, repo, async (r, tx) => {
          const facture = await genererFactureContrat(r, factureGen, ctx, contrat.id, () => now, undefined, true);
          if (tx) await outboxEvent(tx, ctx, { action: "contrat.facture_recurrente_generee", entityType: "contrat", entityId: contrat.id, payload: { factureId: facture.id, factureNumero: facture.numero } });
        });
        generees++;
      } catch (e) {
        if (e instanceof ConflictError) continue;
        erreurs++;
      }
    }
  }
  return { generees, erreurs };
}
