import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import { creerInterventionContratAvecAvance } from "./interventions-use-cases";

export async function autoGenererInterventionsContrats(
  repo: IContratRepository,
  artisanIds: number[],
  now: Date = new Date(),
): Promise<{ generees: number; erreurs: number }> {
  let generees = 0;
  let erreurs = 0;
  for (const artisanId of artisanIds) {
    const ctx: TenantContext = { artisanId, userId: 0 };
    const contrats = await repo.list(ctx);
    const dues = contrats.filter(
      (c) =>
        c.statut === "actif" &&
        c.prochainPassage &&
        new Date(c.prochainPassage) <= now
    );
    for (const contrat of dues) {
      try {
        await creerInterventionContratAvecAvance(repo, ctx, contrat.id, () => now);
        generees++;
      } catch (e) {
        if (e instanceof ConflictError) continue;
        erreurs++;
      }
    }
  }
  return { generees, erreurs };
}
