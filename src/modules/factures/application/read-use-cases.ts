import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IFactureRepository } from "./facture-repository";
import type { Facture, FactureLigne } from "../domain/facture";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
// `TenantContext` (le repo l'applique). `getFacture` sur une ressource d'un autre tenant → le
// repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant). Les lignes sont
// scopées via la facture parente (→ [] si la facture n'appartient pas au tenant).

export function listFactures(repo: IFactureRepository, ctx: TenantContext): Promise<Facture[]> {
  return repo.list(ctx);
}

export async function getFacture(repo: IFactureRepository, ctx: TenantContext, id: number): Promise<Facture> {
  const facture = await repo.getById(ctx, id);
  if (!facture) throw new NotFoundError("Facture introuvable");
  return facture;
}

export function listLignesFacture(repo: IFactureRepository, ctx: TenantContext, factureId: number): Promise<FactureLigne[]> {
  return repo.listLignes(ctx, factureId);
}
