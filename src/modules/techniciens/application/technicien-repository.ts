import type { TenantContext } from "../../../shared/tenant";
import type { Technicien, CreateTechnicienInput, UpdateTechnicienInput } from "../domain/technicien";
import type { Disponibilite, SetDisponibiliteInput } from "../domain/disponibilite";

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

  // Disponibilités hebdomadaires d'un technicien — [] si le technicien n'appartient pas
  // au tenant (anti-IDOR, lecture sans oracle ; la table n'a pas d'artisanId).
  listDisponibilites(ctx: TenantContext, technicienId: number): Promise<Disponibilite[]>;
  // Définit (upsert par jourSemaine) un créneau de disponibilité — null si technicien hors tenant.
  setDisponibilite(ctx: TenantContext, technicienId: number, input: SetDisponibiliteInput): Promise<Disponibilite | null>;
}
