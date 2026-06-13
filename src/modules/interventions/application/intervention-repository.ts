import type { TenantContext } from "../../../shared/tenant";
import type { Intervention, CreateInterventionInput, UpdateInterventionInput } from "../domain/intervention";

// Port du repository interventions. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `interventions` possède un `artisanId` → double cloisonnement RLS + filtre. ⚠️ Les FK
// `clientId`/`technicienId`/`devisId`/`factureId` devront être vérifiées comme appartenant au
// tenant lors des écritures (anti-IDOR-FK) — traité aux use-cases d'écriture (étape ultérieure).
export interface IInterventionRepository {
  list(ctx: TenantContext): Promise<Intervention[]>;
  // null si l'intervention n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Intervention | null>;
  create(ctx: TenantContext, input: CreateInterventionInput): Promise<Intervention>;
  // null si l'intervention n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateInterventionInput): Promise<Intervention | null>;
  // false si l'intervention n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
}
