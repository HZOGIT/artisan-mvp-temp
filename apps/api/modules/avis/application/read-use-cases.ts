import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IAvisRepository } from "./avis-repository";
import type { Avis, AvisEnrichi, AvisStats } from "../domain/avis";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté
// par le `TenantContext` (le repo l'applique). `getAvis` sur une ressource d'un autre
// tenant → le repo renvoie null → on lève NotFoundError (ne révèle pas l'existence).

export function listAvis(repo: IAvisRepository, ctx: TenantContext): Promise<Avis[]> {
  return repo.list(ctx);
}

// Liste enrichie (client + intervention liés) — parité legacy getAll/list.
export function listAvisEnrichi(repo: IAvisRepository, ctx: TenantContext): Promise<AvisEnrichi[]> {
  return repo.listEnrichi(ctx);
}

export async function getAvis(repo: IAvisRepository, ctx: TenantContext, id: number): Promise<Avis> {
  const avis = await repo.getById(ctx, id);
  if (!avis) throw new NotFoundError("Avis introuvable");
  return avis;
}

export function getAvisStats(repo: IAvisRepository, ctx: TenantContext): Promise<AvisStats> {
  return repo.getStats(ctx);
}
