import type { TenantContext } from "../../../shared/tenant";
import type { ClientRef, CreerDemandeInput, DemandeAvis, InterventionRef } from "../domain/demande-avis";

/*
 * Port du workflow « demande d'avis ». Toutes les lectures d'ownership sont scopées
 * tenant (→ null si la ressource n'appartient pas à l'artisan : NOT_FOUND uniforme,
 * anti-oracle d'énumération cross-tenant).
 */
export interface IDemandeAvisRepository {
  // Intervention possédée par le tenant (null sinon).
  getInterventionOwned(ctx: TenantContext, interventionId: number): Promise<InterventionRef | null>;
  // Client possédé par le tenant (null sinon).
  getClientOwned(ctx: TenantContext, clientId: number): Promise<ClientRef | null>;
  // Dernière intervention du client (la plus récente), scopée tenant (null si aucune).
  getDerniereInterventionDuClient(ctx: TenantContext, clientId: number): Promise<InterventionRef | null>;
  // Persiste une demande d'avis pour le tenant.
  creerDemande(ctx: TenantContext, input: CreerDemandeInput): Promise<DemandeAvis>;
}
