import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IBudgetCategorieRepository } from "./budget-categorie-repository";
import type { BudgetCategorie } from "../domain/budget-categorie";

// Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
// `getBudget` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.

export function listBudgets(repo: IBudgetCategorieRepository, ctx: TenantContext): Promise<BudgetCategorie[]> {
  return repo.list(ctx);
}

// Budgets du tenant pour un mois donné ("YYYY-MM") ; [] si aucun.
export function budgetsParMois(repo: IBudgetCategorieRepository, ctx: TenantContext, mois: string): Promise<BudgetCategorie[]> {
  return repo.listByMois(ctx, mois);
}

export async function getBudget(repo: IBudgetCategorieRepository, ctx: TenantContext, id: number): Promise<BudgetCategorie> {
  const budget = await repo.getById(ctx, id);
  if (!budget) throw new NotFoundError("Budget introuvable");
  return budget;
}
