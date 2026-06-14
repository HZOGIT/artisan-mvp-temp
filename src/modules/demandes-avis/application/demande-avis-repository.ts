import type { TenantContext } from "../../../shared/tenant";
import type { CreateDemandeAvisInput, DemandeAvis, DemandeAvisStatut } from "../domain/demande-avis";

// Port du repository demandes-avis. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `demandes_avis` possède un `artisanId` → double cloisonnement RLS + filtre. Le token est généré
// serveur (unique) à la création ; les transitions de statut passent par `setStatut` (use-cases
// dédiés) ; `clientId`/`interventionId` sont validés via `ownsClient`/`ownsIntervention` (anti-IDOR-FK).
export interface IDemandeAvisRepository {
  list(ctx: TenantContext): Promise<DemandeAvis[]>;
  // Demandes du tenant filtrées par statut (scopé tenant ; [] si aucune).
  listByStatut(ctx: TenantContext, statut: DemandeAvisStatut): Promise<DemandeAvis[]>;
  // null si la demande n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<DemandeAvis | null>;
  create(ctx: TenantContext, input: CreateDemandeAvisInput): Promise<DemandeAvis>;
  // Applique une transition de statut ; `avisRecuAt` posé à la complétion. null si hors tenant.
  setStatut(ctx: TenantContext, id: number, statut: DemandeAvisStatut): Promise<DemandeAvis | null>;
  // false si la demande n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // Le client appartient-il au tenant ? (anti-IDOR-FK à la création)
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;
  // L'intervention appartient-elle au tenant ? (anti-IDOR-FK à la création)
  ownsIntervention(ctx: TenantContext, interventionId: number): Promise<boolean>;
}
