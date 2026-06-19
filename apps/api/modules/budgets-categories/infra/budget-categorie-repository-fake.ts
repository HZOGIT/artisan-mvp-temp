import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IBudgetCategorieRepository } from "../application/budget-categorie-repository";
import type { BudgetCategorie, CreateBudgetInput, UpdateBudgetInput } from "../domain/budget-categorie";

/*
 * Implémentation in-memory du repository budgets-categories (tests sans DB). Reproduit les invariants
 * du repo Drizzle : scope par artisanId, artisanId forcé, défauts montants "0", unicité (artisanId,
 * categorie, mois) → ConflictError, update qui ne touche que les montants.
 */
export class FakeBudgetCategorieRepository implements IBudgetCategorieRepository {
  private readonly store: BudgetCategorie[] = [];
  private seq = 0;

  private scoped(ctx: TenantContext): BudgetCategorie[] {
    return this.store.filter((b) => b.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<BudgetCategorie[]> {
    return [...this.scoped(ctx)].sort((a, b) => a.mois.localeCompare(b.mois) || a.categorie.localeCompare(b.categorie) || a.id - b.id);
  }

  async listByMois(ctx: TenantContext, mois: string): Promise<BudgetCategorie[]> {
    return (await this.list(ctx)).filter((b) => b.mois === mois);
  }

  async getById(ctx: TenantContext, id: number): Promise<BudgetCategorie | null> {
    return this.scoped(ctx).find((b) => b.id === id) ?? null;
  }

  async create(ctx: TenantContext, input: CreateBudgetInput): Promise<BudgetCategorie> {
    const doublon = this.scoped(ctx).some((b) => b.categorie === input.categorie && b.mois === input.mois);
    if (doublon) throw new ConflictError("Un budget existe déjà pour cette catégorie et ce mois");
    const budget: BudgetCategorie = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      categorie: input.categorie,
      mois: input.mois,
      budget: input.budget ?? "0.00",
      depenseReelle: input.depenseReelle ?? "0.00",
    };
    this.store.push(budget);
    return budget;
  }

  async update(ctx: TenantContext, id: number, input: UpdateBudgetInput): Promise<BudgetCategorie | null> {
    const idx = this.store.findIndex((b) => b.id === id && b.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const current = this.store[idx];
    const next: BudgetCategorie = {
      ...current,
      ...(input.budget !== undefined ? { budget: input.budget } : {}),
      ...(input.depenseReelle !== undefined ? { depenseReelle: input.depenseReelle } : {}),
      // categorie/mois jamais touchés (clé d'unicité immuable)
    };
    this.store[idx] = next;
    return next;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const idx = this.store.findIndex((b) => b.id === id && b.artisanId === ctx.artisanId);
    if (idx === -1) return false;
    this.store.splice(idx, 1);
    return true;
  }
}
