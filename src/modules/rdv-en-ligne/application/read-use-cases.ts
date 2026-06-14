import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRdvRepository } from "./rdv-repository";
import type { Rdv } from "../domain/rdv";

// Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
// `getRdv` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.

export function listRdvs(repo: IRdvRepository, ctx: TenantContext): Promise<Rdv[]> {
  return repo.list(ctx);
}

export async function getRdv(repo: IRdvRepository, ctx: TenantContext, id: number): Promise<Rdv> {
  const rdv = await repo.getById(ctx, id);
  if (!rdv) throw new NotFoundError("Rendez-vous introuvable");
  return rdv;
}
