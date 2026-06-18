import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "./chantier-repository";
import type { Chantier } from "../domain/chantier";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
// `TenantContext` (le repo l'applique). `getChantier` sur une ressource d'un autre tenant →
// le repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant).

export function listChantiers(repo: IChantierRepository, ctx: TenantContext): Promise<Chantier[]> {
  return repo.list(ctx);
}

export async function getChantier(repo: IChantierRepository, ctx: TenantContext, id: number): Promise<Chantier> {
  const chantier = await repo.getById(ctx, id);
  if (!chantier) throw new NotFoundError("Chantier introuvable");
  return chantier;
}
