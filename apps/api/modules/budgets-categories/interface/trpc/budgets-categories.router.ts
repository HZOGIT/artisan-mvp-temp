import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IBudgetCategorieRepository } from "../../application/budget-categorie-repository";
import { listBudgets, budgetsParMois, getBudget } from "../../application/read-use-cases";
import { creerBudget, modifierBudget, supprimerBudget, copierBudgetsMois } from "../../application/write-use-cases";

const mois = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois au format YYYY-MM invalide");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");

/** Bornes alignées sur la table `budgets_categories` (defense-in-depth). */
const createSchema = z.object({
  categorie: z.string().min(1).max(50),
  mois,
  budget: decimal.optional(),
  depenseReelle: decimal.optional(),
});

/** ⚠️ Montants seuls — `categorie`/`mois` sont la clé d'unicité immuable (changer = supprimer + recréer). */
const updateSchema = z.object({
  budget: decimal.optional(),
  depenseReelle: decimal.optional(),
});

/*
 * Routeur tRPC du domaine budgets-categories (budget mensuel par catégorie). Transport mince : valide
 * les inputs (zod), délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain
 * errors (NotFound→404, Validation→400, Conflict→409 [unicité (categorie, mois)]). Repo injecté.
 */
export function createBudgetsCategoriesRouter(repo: IBudgetCategorieRepository, db?: DbClient) {
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
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerBudget(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "budget_categorie.cree", entityType: "budget_categorie", entityId: result.id, payload: { categorieId: result.categorie, mois: result.mois, montantPrevu: result.budget } });
          return result;
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierBudget(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "budget_categorie.modifie", entityType: "budget_categorie", entityId: id, payload: { budget: data.budget, depenseReelle: data.depenseReelle } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerBudget(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "budget_categorie.supprime", entityType: "budget_categorie", entityId: input.id, payload: { snapshot: { categorieId: before?.categorie, mois: before?.mois, budget: before?.budget } } });
          return { success: true };
        });
      }),

    copierBudgetsMois: protectedProcedure
      .input(z.object({ moisSource: mois, moisCible: mois }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await copierBudgetsMois(r, ctx.tenant, input.moisSource, input.moisCible);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "budget_categorie.copie_mois", entityType: "budget_categorie", entityId: 0, payload: { moisSource: input.moisSource, moisCible: input.moisCible, nbBudgetsCopies: result.copies } });
          return result;
        });
      }),
  });
}
