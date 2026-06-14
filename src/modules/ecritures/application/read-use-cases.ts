import type { TenantContext } from "../../../shared/tenant";
import type { IEcritureRepository } from "./ecriture-repository";
import type { EcritureComptable } from "../domain/ecriture";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
// `TenantContext` (le repo l'applique). La lecture d'écritures d'une facture inconnue/hors tenant
// renvoie simplement [] (pas de NotFound : une absence d'écriture n'est pas une erreur métier).

export function listEcritures(repo: IEcritureRepository, ctx: TenantContext): Promise<EcritureComptable[]> {
  return repo.list(ctx);
}

export function listEcrituresFacture(
  repo: IEcritureRepository,
  ctx: TenantContext,
  factureId: number,
): Promise<EcritureComptable[]> {
  return repo.listByFacture(ctx, factureId);
}
