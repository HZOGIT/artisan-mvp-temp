import type { TenantContext } from "../../../shared/tenant";
import type { BudgetCategorie, CreateBudgetInput, UpdateBudgetInput } from "../domain/budget-categorie";

/*
 * Port du repository budgets-categories. Chaque méthode exige le TenantContext (scope tenant + RLS).
 * `budgets_categories` possède un `artisan_id` → double cloisonnement RLS + filtre. ⚠️ Contrainte DB
 * UNIQUE (artisan_id, categorie, mois) : create peut lever une violation d'unicité → traduite en
 * ConflictError par le repo. L'update ne modifie que les montants (categorie/mois immuables).
 */
export interface IBudgetCategorieRepository {
  list(ctx: TenantContext): Promise<BudgetCategorie[]>;
  // Budgets du tenant pour un mois donné ("YYYY-MM") ; [] si aucun.
  listByMois(ctx: TenantContext, mois: string): Promise<BudgetCategorie[]>;
  // null si le budget n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<BudgetCategorie | null>;
  create(ctx: TenantContext, input: CreateBudgetInput): Promise<BudgetCategorie>;
  // Met à jour les montants (jamais categorie/mois). null si le budget n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateBudgetInput): Promise<BudgetCategorie | null>;
  // false si le budget n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
}
