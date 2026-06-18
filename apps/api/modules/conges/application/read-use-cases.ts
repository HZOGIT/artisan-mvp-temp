import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository } from "./conge-repository";
import type { Conge } from "../domain/conge";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
// `TenantContext` (le repo l'applique). `getConge` sur une ressource d'un autre tenant → le
// repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant).

export function listConges(repo: ICongeRepository, ctx: TenantContext): Promise<Conge[]> {
  return repo.list(ctx);
}

// Demandes en attente d'approbation, scopées tenant (vue manager). Parité legacy `enAttente`.
export function listCongesEnAttente(repo: ICongeRepository, ctx: TenantContext): Promise<Conge[]> {
  return repo.listEnAttente(ctx);
}

export async function getConge(repo: ICongeRepository, ctx: TenantContext, id: number): Promise<Conge> {
  const conge = await repo.getById(ctx, id);
  if (!conge) throw new NotFoundError("Demande de congé introuvable");
  return conge;
}
