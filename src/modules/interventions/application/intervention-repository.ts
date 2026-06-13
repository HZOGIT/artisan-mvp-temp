import type { TenantContext } from "../../../shared/tenant";
import type { Intervention, CreateInterventionInput, UpdateInterventionInput } from "../domain/intervention";

// Nature d'une FK référencée par une intervention (toutes des tables scopées tenant).
export type InterventionRefKind = "client" | "technicien" | "devis" | "facture";

// Port du repository interventions. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `interventions` possède un `artisanId` → double cloisonnement RLS + filtre. ⚠️ Les FK
// `clientId`/`technicienId`/`devisId`/`factureId` sont vérifiées comme appartenant au tenant
// lors des écritures (anti-IDOR-FK) via `ownsRef`.
export interface IInterventionRepository {
  list(ctx: TenantContext): Promise<Intervention[]>;
  // null si l'intervention n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Intervention | null>;
  create(ctx: TenantContext, input: CreateInterventionInput): Promise<Intervention>;
  // null si l'intervention n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateInterventionInput): Promise<Intervention | null>;
  // false si l'intervention n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // true si la ressource référencée (client/technicien/devis/facture) appartient au tenant.
  // Garde anti-IDOR-FK : interdit de lier une intervention à la ressource d'un autre tenant.
  ownsRef(ctx: TenantContext, kind: InterventionRefKind, id: number): Promise<boolean>;
}
