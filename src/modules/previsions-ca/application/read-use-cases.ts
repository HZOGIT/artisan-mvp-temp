import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IPrevisionCARepository } from "./prevision-ca-repository";
import type { PrevisionCA } from "../domain/prevision-ca";

// Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
// `getPrevision` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.

export function listPrevisions(repo: IPrevisionCARepository, ctx: TenantContext): Promise<PrevisionCA[]> {
  return repo.list(ctx);
}

// Prévisions du tenant pour une année donnée ; [] si aucune.
export function previsionsParAnnee(repo: IPrevisionCARepository, ctx: TenantContext, annee: number): Promise<PrevisionCA[]> {
  return repo.listByAnnee(ctx, annee);
}

export async function getPrevision(repo: IPrevisionCARepository, ctx: TenantContext, id: number): Promise<PrevisionCA> {
  const prevision = await repo.getById(ctx, id);
  if (!prevision) throw new NotFoundError("Prévision de CA introuvable");
  return prevision;
}
