import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { ICategorieDepenseRepository } from "../../application/categorie-depense-repository";
import { listCategories, getCategorie } from "../../application/read-use-cases";
import { creerCategorie, modifierCategorie, supprimerCategorie } from "../../application/write-use-cases";

const couleur = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale #RRGGBB invalide");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");

/** Bornes alignées sur la table `categories_depenses` (defense-in-depth). */
const createSchema = z.object({
  nom: z.string().min(1).max(100),
  couleur: couleur.optional(),
  icone: z.string().max(50).optional(),
  compteComptable: z.string().max(10).nullish(),
  deductibleTva: z.boolean().optional(),
  deductibleIr: z.boolean().optional(),
  plafondMensuel: decimal.nullish(),
  actif: z.boolean().optional(),
  ordre: z.number().int().optional(),
});

const updateSchema = z.object({
  nom: z.string().min(1).max(100).optional(),
  couleur: couleur.optional(),
  icone: z.string().max(50).optional(),
  compteComptable: z.string().max(10).nullish(),
  deductibleTva: z.boolean().optional(),
  deductibleIr: z.boolean().optional(),
  plafondMensuel: decimal.nullish(),
  actif: z.boolean().optional(),
  ordre: z.number().int().optional(),
});

/*
 * Routeur tRPC du domaine categories-depenses (catalogue). Transport mince : valide les inputs
 * (zod), délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
 * (NotFound→404, Validation→400, Conflict→409 [unicité du nom]). Repo injecté.
 */
export function createCategoriesDepensesRouter(repo: ICategorieDepenseRepository, db?: DbClient) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listCategories(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getCategorie(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerCategorie(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "categorie_depense.creee", entityType: "categorie_depense", entityId: result.id, payload: { categorieId: result.id, nom: result.nom, couleur: result.couleur } });
          return result;
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierCategorie(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "categorie_depense.modifiee", entityType: "categorie_depense", entityId: id, payload: { categorieId: id } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerCategorie(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "categorie_depense.supprimee", entityType: "categorie_depense", entityId: input.id, payload: { snapshot: { categorieId: input.id, nom: before?.nom } } });
          return { success: true };
        });
      }),
  });
}
