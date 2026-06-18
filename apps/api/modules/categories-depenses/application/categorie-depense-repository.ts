import type { TenantContext } from "../../../shared/tenant";
import type { CategorieDepense, CreateCategorieInput, UpdateCategorieInput } from "../domain/categorie-depense";

// Port du repository categories-depenses (catalogue artisan). Chaque méthode exige le TenantContext
// (scope tenant + RLS). `categories_depenses` possède un `artisan_id` → double cloisonnement RLS +
// filtre. ⚠️ Contrainte DB UNIQUE (artisan_id, nom) : create/update peuvent lever une violation
// d'unicité → traduite en ConflictError par le repo/use-case.
export interface ICategorieDepenseRepository {
  list(ctx: TenantContext): Promise<CategorieDepense[]>;
  // null si la catégorie n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<CategorieDepense | null>;
  create(ctx: TenantContext, input: CreateCategorieInput): Promise<CategorieDepense>;
  // null si la catégorie n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateCategorieInput): Promise<CategorieDepense | null>;
  // false si la catégorie n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
}
