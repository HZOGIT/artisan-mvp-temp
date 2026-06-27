import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import type { ContratFactureGenerator } from "./contrat-facture-generator";
import { genererFactureContrat } from "./interventions-use-cases";

export async function autoGenererFacturesContrats(
  repo: IContratRepository,
  factureGen: ContratFactureGenerator,
  artisanIds: number[],
  now: Date = new Date(),
): Promise<{ generees: number; erreurs: number }> {
  let generees = 0;
  let erreurs = 0;
  for (const artisanId of artisanIds) {
    const ctx: TenantContext = { artisanId, userId: 0 };
    const aFacturer = await repo.listAFacturer(ctx);
    for (const contrat of aFacturer) {
      try {
        await genererFactureContrat(repo, factureGen, ctx, contrat.id, () => now, undefined, true);
        generees++;
      } catch (e) {
        if (e instanceof ConflictError) continue;
        erreurs++;
      }
    }
  }
  return { generees, erreurs };
}
