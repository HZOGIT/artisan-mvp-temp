import type { TenantContext } from "../../../shared/tenant";
import type {
  Vehicule,
  CreateVehiculeInput,
  UpdateVehiculeInput,
  EntretienVehicule,
  CreateEntretienInput,
  AssuranceVehicule,
  CreateAssuranceInput,
} from "../domain/vehicule";

// Port du repository vehicules. CHAQUE méthode exige le TenantContext : le scoping
// tenant (artisanId + RLS) est non négociable. Les opérations sur entretiens/assurances
// passent par le vehiculeId mais doivent vérifier l'appartenance au tenant (la ressource
// d'un autre tenant doit être invisible : getById → null, et non une erreur révélatrice).
export interface IVehiculeRepository {
  list(ctx: TenantContext): Promise<Vehicule[]>;
  getById(ctx: TenantContext, id: number): Promise<Vehicule | null>;
  create(ctx: TenantContext, input: CreateVehiculeInput): Promise<Vehicule>;
  update(ctx: TenantContext, id: number, input: UpdateVehiculeInput): Promise<Vehicule | null>;
  delete(ctx: TenantContext, id: number): Promise<boolean>;

  // Kilométrage : mise à jour bornée (le compteur ne recule pas — invariant à appliquer
  // dans le use-case/impl). Renvoie le véhicule à jour, ou null si hors tenant.
  updateKilometrage(ctx: TenantContext, id: number, kilometrage: number): Promise<Vehicule | null>;

  // Entretiens (scopés via le véhicule du tenant).
  listEntretiens(ctx: TenantContext, vehiculeId: number): Promise<EntretienVehicule[]>;
  addEntretien(ctx: TenantContext, vehiculeId: number, input: CreateEntretienInput): Promise<EntretienVehicule | null>;

  // Assurances (scopées via le véhicule du tenant).
  listAssurances(ctx: TenantContext, vehiculeId: number): Promise<AssuranceVehicule[]>;
  addAssurance(ctx: TenantContext, vehiculeId: number, input: CreateAssuranceInput): Promise<AssuranceVehicule | null>;
}
