import type { TenantContext } from "../../../shared/tenant";
import type { Conge, CreateCongeInput, UpdateCongeInput } from "../domain/conge";

// Port du repository conges. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `conges` possède un `artisanId` → double cloisonnement RLS + filtre. ⚠️ Les invariants
// sensibles (anti self-approbation, idempotence du solde, recrédit à l'annulation) sont
// portés par les use-cases du workflow d'approbation (étape ultérieure), pas par le CRUD.
export interface ICongeRepository {
  list(ctx: TenantContext): Promise<Conge[]>;
  // null si la demande n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Conge | null>;
  create(ctx: TenantContext, input: CreateCongeInput): Promise<Conge>;
  // null si la demande n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateCongeInput): Promise<Conge | null>;
  // false si la demande n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // true si le technicien (demandeur) appartient au tenant. Garde anti-IDOR-FK : interdit de
  // créer/affecter une demande de congé à un technicien d'un autre tenant.
  ownsTechnicien(ctx: TenantContext, technicienId: number): Promise<boolean>;
}
