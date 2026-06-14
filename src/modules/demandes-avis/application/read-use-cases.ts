import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDemandeAvisRepository } from "./demande-avis-repository";
import type { DemandeAvis, DemandeAvisStatut } from "../domain/demande-avis";

// Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
// `getDemandeAvis` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.

export function listDemandesAvis(repo: IDemandeAvisRepository, ctx: TenantContext): Promise<DemandeAvis[]> {
  return repo.list(ctx);
}

// Demandes du tenant filtrées par statut ; [] si aucune.
export function demandesAvisParStatut(repo: IDemandeAvisRepository, ctx: TenantContext, statut: DemandeAvisStatut): Promise<DemandeAvis[]> {
  return repo.listByStatut(ctx, statut);
}

export async function getDemandeAvis(repo: IDemandeAvisRepository, ctx: TenantContext, id: number): Promise<DemandeAvis> {
  const demande = await repo.getById(ctx, id);
  if (!demande) throw new NotFoundError("Demande d'avis introuvable");
  return demande;
}
