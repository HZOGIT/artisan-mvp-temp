import type { TenantContext } from "../../../shared/tenant";
import type { Depense, CreateDepenseInput, UpdateDepenseInput } from "../domain/depense";

// Port du repository depenses. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `depenses` possède un `artisan_id` → double cloisonnement RLS + filtre. ⚠️ Les invariants
// sensibles (cohérence TVA, anti-IDOR-FK des liens chantier/intervention/client, workflow de
// remboursement) sont portés par les use-cases (étapes ultérieures), pas par le CRUD.
export interface IDepenseRepository {
  list(ctx: TenantContext): Promise<Depense[]>;
  // null si la dépense n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Depense | null>;
  create(ctx: TenantContext, input: CreateDepenseInput): Promise<Depense>;
  // null si la dépense n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateDepenseInput): Promise<Depense | null>;
  // false si la dépense n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
}
