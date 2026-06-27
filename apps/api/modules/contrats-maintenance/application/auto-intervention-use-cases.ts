import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import { addMonthsClamped } from "./interventions-use-cases";

const MOIS_PAR_PERIODICITE: Record<string, number> = {
  mensuel: 1,
  trimestriel: 3,
  semestriel: 6,
  annuel: 12,
};

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
        const prochainPassage = contrat.prochainPassage;
        if (!prochainPassage) continue;
        await repo.createIntervention(ctx, {
          contratId: contrat.id,
          titre: `Visite — ${contrat.titre}`,
          dateIntervention: prochainPassage,
        });
        const next = addMonthsClamped(
          prochainPassage,
          MOIS_PAR_PERIODICITE[contrat.periodicite] ?? 1
        );
        await repo.update(ctx, contrat.id, { prochainPassage: next });
        generees++;
      } catch (e) {
        erreurs++;
      }
    }
  }
  return { generees, erreurs };
}
