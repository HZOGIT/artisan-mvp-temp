import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import type { Contrat } from "../domain/contrat";

/*
 * Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
 * `getContrat` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.
 */

export function listContrats(repo: IContratRepository, ctx: TenantContext): Promise<Contrat[]> {
  return repo.list(ctx);
}

export async function getContrat(repo: IContratRepository, ctx: TenantContext, id: number): Promise<Contrat> {
  const contrat = await repo.getById(ctx, id);
  if (!contrat) throw new NotFoundError("Contrat introuvable");
  return contrat;
}
