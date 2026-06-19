import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IBudgetCategorieRepository } from "../../application/budget-categorie-repository";
import { listBudgets, budgetsParMois, getBudget } from "../../application/read-use-cases";
import { creerBudget, modifierBudget, supprimerBudget } from "../../application/write-use-cases";

const mois = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois au format YYYY-MM invalide");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");

// Bornes alignées sur la table `budgets_categories` (defense-in-depth).
const createSchema = z.object({
  categorie: z.string().min(1).max(50),
  mois,
  budget: decimal.optional(),
  depenseReelle: decimal.optional(),
});

// ⚠️ Montants seuls — `categorie`/`mois` sont la clé d'unicité immuable (changer = supprimer + recréer).
const updateSchema = z.object({
  budget: decimal.optional(),
  depenseReelle: decimal.optional(),
});

/*
 * Routeur tRPC du domaine budgets-categories (budget mensuel par catégorie). Transport mince : valide
 * les inputs (zod), délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain
 * errors (NotFound→404, Validation→400, Conflict→409 [unicité (categorie, mois)]). Repo injecté.
 */
export function createBudgetsCategoriesRouter(repo: IBudgetCategorieRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listBudgets(repo, ctx.tenant)),

    byMois: protectedProcedure
      .input(z.object({ mois }))
      .query(({ ctx, input }) => budgetsParMois(repo, ctx.tenant, input.mois)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getBudget(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerBudget(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierBudget(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerBudget(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
