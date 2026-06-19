import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IPrevisionCARepository } from "./prevision-ca-repository";
import type { PrevisionCA, HistoriqueCA, ComparaisonMois } from "../domain/prevision-ca";

function num(s: string | null | undefined): number {
  const n = parseFloat(String(s ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/*
 * Agrégat PUR : compare, mois par mois, le CA prévisionnel (previsions_ca) au CA réalisé
 * (historique_ca). Parité legacy `getComparaisonPrevisionsRealise` (arrondis identiques).
 */
export function computeComparaison(previsions: readonly PrevisionCA[], historique: readonly HistoriqueCA[]): ComparaisonMois[] {
  const realiseParMois = new Map(historique.map((h) => [h.mois, num(h.caTotal)]));
  return previsions.map((p) => {
    const caRealise = realiseParMois.get(p.mois) ?? 0;
    const caPrevisionnel = num(p.caPrevisionnel);
    const ecart = caRealise - caPrevisionnel;
    const ecartPourcentage = caPrevisionnel > 0 ? (ecart / caPrevisionnel) * 100 : 0;
    return {
      mois: p.mois,
      caPrevisionnel,
      caRealise,
      ecart: Math.round(ecart * 100) / 100,
      ecartPourcentage: Math.round(ecartPourcentage * 10) / 10,
    };
  });
}

/*
 * Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
 * `getPrevision` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.
 */

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

// Parité client `previsions.getComparaison {annee}` — prévu vs réalisé, mois par mois (lecture seule).
export async function getComparaison(repo: IPrevisionCARepository, ctx: TenantContext, annee: number): Promise<ComparaisonMois[]> {
  const [previsions, historique] = await Promise.all([repo.listByAnnee(ctx, annee), repo.listHistoriqueAnnee(ctx, annee)]);
  return computeComparaison(previsions, historique);
}
