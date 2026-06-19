import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRelanceDevisRepository } from "./relance-devis-repository";
import type { RelanceDevis } from "../domain/relance-devis";

/*
 * Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
 * `getRelance` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.
 */

export function listRelances(repo: IRelanceDevisRepository, ctx: TenantContext): Promise<RelanceDevis[]> {
  return repo.list(ctx);
}

/** Historique des relances d'un devis (scopé tenant ; [] si aucune — pas une erreur). */
export function relancesParDevis(repo: IRelanceDevisRepository, ctx: TenantContext, devisId: number): Promise<RelanceDevis[]> {
  return repo.listByDevis(ctx, devisId);
}

export async function getRelance(repo: IRelanceDevisRepository, ctx: TenantContext, id: number): Promise<RelanceDevis> {
  const relance = await repo.getById(ctx, id);
  if (!relance) throw new NotFoundError("Relance introuvable");
  return relance;
}
