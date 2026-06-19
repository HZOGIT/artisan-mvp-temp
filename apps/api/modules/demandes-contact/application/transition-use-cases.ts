import { ConflictError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDemandeContactRepository } from "./demande-contact-repository";
import type { DemandeContact, DemandeContactStatut } from "../domain/demande-contact";

/*
 * État machine des demandes de contact (CRM). Transitions autorisées par statut :
 *  - nouveau  → contacte | converti | perdu
 *  - contacte → converti | perdu
 *  - converti / perdu → ∅ (terminaux)
 * Toute transition hors de cette table est refusée (ConflictError). La conversion (→converti) peut
 * lier un `clientId` du tenant (anti-IDOR via `ownsClient`).
 */
const TRANSITIONS: Record<DemandeContactStatut, readonly DemandeContactStatut[]> = {
  nouveau: ["contacte", "converti", "perdu"],
  contacte: ["converti", "perdu"],
  converti: [],
  perdu: [],
};

export function peutTransitionner(from: DemandeContactStatut, to: DemandeContactStatut): boolean {
  return TRANSITIONS[from].includes(to);
}

/*
 * Applique une transition après vérification de l'ownership (scopé tenant) et de la légalité de la
 * transition. `clientId` optionnel transmis (conversion) — son ownership est vérifié en amont.
 */
async function appliquerTransition(
  repo: IDemandeContactRepository,
  ctx: TenantContext,
  id: number,
  cible: DemandeContactStatut,
  clientId?: number,
): Promise<DemandeContact> {
  const demande = await repo.getById(ctx, id);
  if (!demande) throw new NotFoundError("Demande de contact introuvable");
  if (!peutTransitionner(demande.statut, cible)) {
    throw new ConflictError(`Transition de statut invalide depuis « ${demande.statut} »`);
  }
  const updated = await repo.setStatut(ctx, id, cible, clientId);
  if (!updated) throw new NotFoundError("Demande de contact introuvable");
  return updated;
}

export function marquerContacte(repo: IDemandeContactRepository, ctx: TenantContext, id: number): Promise<DemandeContact> {
  return appliquerTransition(repo, ctx, id, "contacte");
}

// Conversion : si un `clientId` est fourni, il doit appartenir au tenant (anti-IDOR-FK).
export async function convertir(repo: IDemandeContactRepository, ctx: TenantContext, id: number, clientId?: number): Promise<DemandeContact> {
  if (clientId !== undefined && !(await repo.ownsClient(ctx, clientId))) {
    throw new NotFoundError("Client introuvable");
  }
  return appliquerTransition(repo, ctx, id, "converti", clientId);
}

export function marquerPerdu(repo: IDemandeContactRepository, ctx: TenantContext, id: number): Promise<DemandeContact> {
  return appliquerTransition(repo, ctx, id, "perdu");
}
