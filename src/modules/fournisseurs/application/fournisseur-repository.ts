import type { TenantContext } from "../../../shared/tenant";
import type { Fournisseur, CreateFournisseurInput, UpdateFournisseurInput } from "../domain/fournisseur";

// Port du repository fournisseurs. Chaque méthode exige le TenantContext (scope tenant +
// RLS). `fournisseurs` possède un `artisanId` → double cloisonnement RLS + filtre.
// Les associations article↔fournisseur (prix d'achat, références — tenant-privées, table
// SANS artisanId) seront ajoutées à une étape ultérieure, scopées via l'ownership du
// fournisseur (anti-IDOR historique).
export interface IFournisseurRepository {
  list(ctx: TenantContext): Promise<Fournisseur[]>;
  getById(ctx: TenantContext, id: number): Promise<Fournisseur | null>;
  create(ctx: TenantContext, input: CreateFournisseurInput): Promise<Fournisseur>;
  // null si le fournisseur n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateFournisseurInput): Promise<Fournisseur | null>;
  // false si le fournisseur n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
}
