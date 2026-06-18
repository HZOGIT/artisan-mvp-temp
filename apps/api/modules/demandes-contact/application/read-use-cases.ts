import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDemandeContactRepository } from "./demande-contact-repository";
import type { DemandeContact, DemandeContactStatut } from "../domain/demande-contact";

// Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
// `getDemande` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.

export function listDemandes(repo: IDemandeContactRepository, ctx: TenantContext): Promise<DemandeContact[]> {
  return repo.list(ctx);
}

// Demandes filtrées par statut (scopé tenant ; [] si aucune — pas une erreur métier).
export function demandesParStatut(repo: IDemandeContactRepository, ctx: TenantContext, statut: DemandeContactStatut): Promise<DemandeContact[]> {
  return repo.listByStatut(ctx, statut);
}

export async function getDemande(repo: IDemandeContactRepository, ctx: TenantContext, id: number): Promise<DemandeContact> {
  const demande = await repo.getById(ctx, id);
  if (!demande) throw new NotFoundError("Demande de contact introuvable");
  return demande;
}
