import type { TenantContext } from "../../../shared/tenant";
import type { Chantier, CreateChantierInput, UpdateChantierInput } from "../domain/chantier";

// Port du repository chantiers. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `chantiers` possède un `artisanId` → double cloisonnement RLS + filtre. ⚠️ La FK `clientId`
// devra être vérifiée comme appartenant au tenant lors des écritures (anti-IDOR-FK) — traité
// aux use-cases d'écriture (étape ultérieure).
export interface IChantierRepository {
  list(ctx: TenantContext): Promise<Chantier[]>;
  // null si le chantier n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Chantier | null>;
  create(ctx: TenantContext, input: CreateChantierInput): Promise<Chantier>;
  // null si le chantier n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateChantierInput): Promise<Chantier | null>;
  // false si le chantier n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
}
