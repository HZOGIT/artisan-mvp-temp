import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRegleCategorisationRepository } from "./regle-categorisation-repository";
import type { RegleCategorisation } from "../domain/regle-categorisation";

// Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
// `getRegle` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.

export function listRegles(repo: IRegleCategorisationRepository, ctx: TenantContext): Promise<RegleCategorisation[]> {
  return repo.list(ctx);
}

export async function getRegle(repo: IRegleCategorisationRepository, ctx: TenantContext, id: number): Promise<RegleCategorisation> {
  const regle = await repo.getById(ctx, id);
  if (!regle) throw new NotFoundError("Règle de catégorisation introuvable");
  return regle;
}
