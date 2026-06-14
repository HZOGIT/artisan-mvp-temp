import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IPrevisionCARepository } from "./prevision-ca-repository";
import type { PrevisionCA, HistoriqueCA } from "../domain/prevision-ca";

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

// Parité client `previsions.getPrevisions {annee?}` — défaut = année courante.
export function getPrevisions(repo: IPrevisionCARepository, ctx: TenantContext, annee?: number): Promise<PrevisionCA[]> {
  return repo.listByAnnee(ctx, annee ?? new Date().getFullYear());
}

// Parité client `previsions.getHistorique {nombreMois=24}` — historique de CA mensuel agrégé.
export function getHistorique(repo: IPrevisionCARepository, ctx: TenantContext, nombreMois: number): Promise<HistoriqueCA[]> {
  return repo.listHistorique(ctx, nombreMois);
}
