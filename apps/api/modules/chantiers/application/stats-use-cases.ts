import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "./chantier-repository";
import type { Chantier, ChantierPhase, ChantierStatistiques } from "../domain/chantier";

/*
 * Use-cases « statistiques de chantier » (lecture seule) + recalcul d'avancement. L'agrégat est
 * calculé par une fonction PURE (`computeStatistiques`) — testable sans I/O. Parité legacy
 * `getStatistiquesChantier` / `calculerAvancementChantier` (server/db.ts).
 */

function num(s: string | null | undefined): number {
  const n = parseFloat(String(s ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/*
 * Agrégat pur : combine le chantier, ses phases, le nombre d'interventions/documents liés et le
 * coût réel (somme des dépenses TTC) en statistiques. `coutReel`>0 prime sur `budgetRealise` manuel.
 */
export function computeStatistiques(
  chantier: Chantier,
  phases: readonly ChantierPhase[],
  nombreInterventions: number,
  nombreDocuments: number,
  coutReelStr: string,
): ChantierStatistiques {
  const phasesTerminees = phases.filter((p) => p.statut === "termine").length;
  const budgetTotal = num(chantier.budgetPrevisionnel);
  const coutReel = num(coutReelStr);
  const budgetRealiseManuel = num(chantier.budgetRealise);
  const budgetConsomme = coutReel > 0 ? coutReel : budgetRealiseManuel;
  return {
    nombrePhases: phases.length,
    phasesTerminees,
    nombreInterventions,
    nombreDocuments,
    budgetConsomme,
    budgetTotal,
    coutReel,
    marge: budgetTotal > 0 ? budgetTotal - budgetConsomme : null,
    margePct: budgetTotal > 0 ? Math.round(((budgetTotal - budgetConsomme) / budgetTotal) * 100) : null,
    pourcentageBudget: budgetTotal > 0 ? Math.round((budgetConsomme / budgetTotal) * 100) : 0,
    avancement: chantier.avancement || 0,
  };
}

/** Statistiques d'un chantier possédé (404 sinon). Lecture seule. */
export async function getStatistiquesChantier(
  repo: IChantierRepository,
  ctx: TenantContext,
  chantierId: number,
): Promise<ChantierStatistiques> {
  const chantier = await repo.getById(ctx, chantierId);
  if (!chantier) throw new NotFoundError("Chantier introuvable");
  const [phases, liens, documents, coutReel] = await Promise.all([
    repo.listPhases(ctx, chantierId),
    repo.listInterventionsLiens(ctx, chantierId),
    repo.listDocuments(ctx, chantierId),
    repo.sumDepensesChantier(ctx, chantierId),
  ]);
  return computeStatistiques(chantier, phases, liens.length, documents.length, coutReel);
}

/*
 * Recalcule l'avancement d'un chantier possédé (404 sinon) = moyenne des avancements de ses phases
 * (0 si aucune phase, sans écriture — parité legacy). Persiste le résultat (MAJ `chantiers.avancement`).
 */
export async function calculerAvancementChantier(
  repo: IChantierRepository,
  ctx: TenantContext,
  chantierId: number,
): Promise<{ avancement: number }> {
  if (!(await repo.getById(ctx, chantierId))) throw new NotFoundError("Chantier introuvable");
  const phases = await repo.listPhases(ctx, chantierId);
  if (phases.length === 0) return { avancement: 0 };
  const total = phases.reduce((sum, p) => sum + (p.avancement || 0), 0);
  const avancement = Math.round(total / phases.length);
  await repo.setAvancement(ctx, chantierId, avancement);
  return { avancement };
}
