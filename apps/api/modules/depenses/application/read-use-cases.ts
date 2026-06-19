import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDepenseRepository } from "./depense-repository";
import type { Depense, DoublonParams, DepenseDoublon, DepenseStats } from "../domain/depense";

/*
 * Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
 * `TenantContext` (le repo l'applique). `getDepense` sur une ressource d'un autre tenant → le
 * repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant).
 */

export function listDepenses(repo: IDepenseRepository, ctx: TenantContext): Promise<Depense[]> {
  return repo.list(ctx);
}

export async function getDepense(repo: IDepenseRepository, ctx: TenantContext, id: number): Promise<Depense> {
  const depense = await repo.getById(ctx, id);
  if (!depense) throw new NotFoundError("Dépense introuvable");
  return depense;
}

/*
 * Détection de doublons (aide à la saisie). Parité legacy : pas de détection sur montant nul/date
 * invalide (évite des faux positifs en masse) → renvoie [].
 */
export async function checkDoublons(repo: IDepenseRepository, ctx: TenantContext, params: DoublonParams): Promise<DepenseDoublon[]> {
  if (!(params.montantTtc > 0)) return [];
  if (Number.isNaN(new Date(params.dateDepense).getTime())) return [];
  return repo.findDoublons(ctx, params);
}

/** Statistiques du mois (défaut = mois courant `YYYY-MM`). */
export function getDepensesStats(repo: IDepenseRepository, ctx: TenantContext, mois?: string): Promise<DepenseStats> {
  const m = mois || new Date().toISOString().slice(0, 7);
  return repo.getStats(ctx, m);
}
