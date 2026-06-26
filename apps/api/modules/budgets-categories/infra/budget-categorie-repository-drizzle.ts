import { and, asc, eq } from "drizzle-orm";
import { budgetsCategories } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IBudgetCategorieRepository } from "../application/budget-categorie-repository";
import type { BudgetCategorie, CreateBudgetInput, UpdateBudgetInput } from "../domain/budget-categorie";

type BudgetRow = typeof budgetsCategories.$inferSelect;

/** Traduit une ligne PG (colonnes snake_case) → domaine (camelCase). Défauts montants "0" si null. */
function toBudget(r: BudgetRow): BudgetCategorie {
  return {
    id: r.id,
    artisanId: r.artisan_id,
    categorie: r.categorie,
    mois: r.mois,
    budget: r.budget ?? "0.00",
    depenseReelle: r.depense_reelle ?? "0.00",
  };
}

/*
 * Violation de contrainte unique PostgreSQL (uq_budget_mois) → ConflictError métier. ⚠️ Drizzle
 * enveloppe l'erreur pg (« Failed query: … ») : le code `23505` est porté par la chaîne de `cause`.
 */
function estViolationUnique(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; e != null && i < 5; i++) {
    if (typeof e === "object" && (e as { code?: string }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/*
 * Implémentation Drizzle du repository budgets-categories. Double cloisonnement RLS + filtre
 * `artisan_id` sur `budgets_categories`. `artisan_id` forcé à la création. ⚠️ Contrainte DB UNIQUE
 * (artisan_id, categorie, mois) → les violations (PG 23505) sont traduites en ConflictError. L'update
 * ne touche que les montants (categorie/mois immuables = clé d'unicité).
 */
export class BudgetCategorieRepositoryDrizzle implements IBudgetCategorieRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<BudgetCategorie[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(budgetsCategories)
        .where(eq(budgetsCategories.artisan_id, ctx.artisanId))
        .orderBy(asc(budgetsCategories.mois), asc(budgetsCategories.categorie), asc(budgetsCategories.id));
      return rows.map(toBudget);
    });
  }

  listByMois(ctx: TenantContext, mois: string): Promise<BudgetCategorie[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(budgetsCategories)
        .where(and(eq(budgetsCategories.artisan_id, ctx.artisanId), eq(budgetsCategories.mois, mois)))
        .orderBy(asc(budgetsCategories.categorie), asc(budgetsCategories.id));
      return rows.map(toBudget);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<BudgetCategorie | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(budgetsCategories)
        .where(and(eq(budgetsCategories.id, id), eq(budgetsCategories.artisan_id, ctx.artisanId)))
        .limit(1);
      return row ? toBudget(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateBudgetInput): Promise<BudgetCategorie> {
    return withTenant(this.db, ctx, async (tx) => {
      try {
        const [row] = await tx
          .insert(budgetsCategories)
          .values({
            artisan_id: ctx.artisanId,
            categorie: input.categorie,
            mois: input.mois,
            budget: input.budget ?? undefined,
            depense_reelle: input.depenseReelle ?? undefined,
          })
          .returning();
        return toBudget(row);
      } catch (err) {
        if (estViolationUnique(err)) throw new ConflictError("Un budget existe déjà pour cette catégorie et ce mois");
        throw err;
      }
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateBudgetInput): Promise<BudgetCategorie | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Montants seulement (UpdateBudgetInput exclut categorie/mois = clé d'unicité immuable). */
      const set: Partial<typeof budgetsCategories.$inferInsert> = {};
      if (input.budget !== undefined) set.budget = input.budget;
      if (input.depenseReelle !== undefined) set.depense_reelle = input.depenseReelle;
      if (Object.keys(set).length === 0) {
        const [row] = await tx
          .select()
          .from(budgetsCategories)
          .where(and(eq(budgetsCategories.id, id), eq(budgetsCategories.artisan_id, ctx.artisanId)))
          .limit(1);
        return row ? toBudget(row) : null;
      }
      const [row] = await tx
        .update(budgetsCategories)
        .set(set)
        .where(and(eq(budgetsCategories.id, id), eq(budgetsCategories.artisan_id, ctx.artisanId)))
        .returning();
      return row ? toBudget(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(budgetsCategories)
        .where(and(eq(budgetsCategories.id, id), eq(budgetsCategories.artisan_id, ctx.artisanId)))
        .returning({ id: budgetsCategories.id });
      return deleted.length > 0;
    });
  }

  withDb(db: DbClient): BudgetCategorieRepositoryDrizzle {
    return new BudgetCategorieRepositoryDrizzle(db);
  }
}
