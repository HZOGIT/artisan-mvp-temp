import type { TenantContext } from "../../../shared/tenant";
import type { CreateDemandeInput, DemandeContact, DemandeContactStatut, UpdateDemandeInput } from "../domain/demande-contact";

/*
 * Port du repository demandes-contact. Chaque méthode exige le TenantContext (scope tenant + RLS).
 * `demandes_contact` possède un `artisanId` → double cloisonnement RLS + filtre. Les transitions de
 * statut passent par `setStatut` (use-cases dédiés) ; la conversion peut lier un `clientId` validé
 * via `ownsClient` (anti-IDOR-FK).
 */
export interface IDemandeContactRepository {
  list(ctx: TenantContext): Promise<DemandeContact[]>;
  // Demandes du tenant filtrées par statut (scopé tenant ; [] si aucune).
  listByStatut(ctx: TenantContext, statut: DemandeContactStatut): Promise<DemandeContact[]>;
  // null si la demande n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<DemandeContact | null>;
  create(ctx: TenantContext, input: CreateDemandeInput): Promise<DemandeContact>;
  // Met à jour les métadonnées (jamais statut/clientId). null si hors tenant.
  update(ctx: TenantContext, id: number, input: UpdateDemandeInput): Promise<DemandeContact | null>;
  // Applique une transition de statut ; `clientId` optionnel lié à la conversion. null si hors tenant.
  setStatut(ctx: TenantContext, id: number, statut: DemandeContactStatut, clientId?: number | null): Promise<DemandeContact | null>;
  // false si la demande n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // Le client appartient-il au tenant ? (anti-IDOR-FK pour le lien à la conversion)
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;
}
