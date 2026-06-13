import type { TenantContext } from "../../../shared/tenant";
import type { Technicien, CreateTechnicienInput, UpdateTechnicienInput } from "../domain/technicien";

// Port du repository techniciens. Chaque méthode exige le TenantContext (scope tenant +
// RLS). `techniciens` possède un `artisanId` → double cloisonnement RLS + filtre.
// Les sous-ressources (positions/disponibilités/objectifs — tables SANS artisanId)
// seront ajoutées aux étapes suivantes, scopées via l'appartenance du technicien (anti-IDOR
// géoloc historique).
export interface ITechnicienRepository {
  list(ctx: TenantContext): Promise<Technicien[]>;
  getById(ctx: TenantContext, id: number): Promise<Technicien | null>;
  create(ctx: TenantContext, input: CreateTechnicienInput): Promise<Technicien>;
  // null si le technicien n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateTechnicienInput): Promise<Technicien | null>;
  // false si le technicien n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
}
