import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisRepository } from "./devis-repository";
import type { Devis, DevisLigne } from "../domain/devis";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
// `TenantContext` (le repo l'applique). `getDevis` sur une ressource d'un autre tenant → le repo
// renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant). Les lignes sont scopées
// via le devis parent (→ [] si le devis n'appartient pas au tenant).

export function listDevis(repo: IDevisRepository, ctx: TenantContext): Promise<Devis[]> {
  return repo.list(ctx);
}

export async function getDevis(repo: IDevisRepository, ctx: TenantContext, id: number): Promise<Devis> {
  const devis = await repo.getById(ctx, id);
  if (!devis) throw new NotFoundError("Devis introuvable");
  return devis;
}

export function listLignesDevis(repo: IDevisRepository, ctx: TenantContext, devisId: number): Promise<DevisLigne[]> {
  return repo.listLignes(ctx, devisId);
}
