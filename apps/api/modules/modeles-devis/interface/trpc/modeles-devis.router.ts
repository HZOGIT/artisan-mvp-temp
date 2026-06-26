import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IModeleDevisRepository } from "../../application/modele-devis-repository";
import { listModelesDevis, getModeleDevis } from "../../application/read-use-cases";
import { creerModeleDevis, modifierModeleDevis, supprimerModeleDevis } from "../../application/write-use-cases";

const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");

/*
 * Ligne de modèle (defense-in-depth aligné sur `modeles_devis_lignes`). Pas de montants dérivés
 * (gabarit) : seules les valeurs saisies sont bornées ; la validation métier fine est au use-case.
 */
const ligneSchema = z.object({
  articleId: z.number().int().nullish(),
  designation: z.string().min(1).max(255),
  description: z.string().max(5000).nullish(),
  quantite: decimal.optional(),
  unite: z.string().max(20).optional(),
  prixUnitaireHT: decimal.optional(),
  tauxTVA: decimal.optional(),
  remise: decimal.optional(),
  ordre: z.number().int().optional(),
});

const createSchema = z.object({
  nom: z.string().min(1).max(255),
  description: z.string().max(5000).nullish(),
  notes: z.string().max(5000).nullish(),
  isDefault: z.boolean().optional(),
  lignes: z.array(ligneSchema).optional(),
});

const updateSchema = z.object({
  nom: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullish(),
  notes: z.string().max(5000).nullish(),
  isDefault: z.boolean().optional(),
  /** si fourni → remplacement complet des lignes */
  lignes: z.array(ligneSchema).optional(),
});

/*
 * Routeur tRPC du domaine modeles-devis (agrégat en-tête + lignes). Transport mince : valide les
 * inputs (zod), délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain
 * errors (NotFound→404, Validation→400). L'unicité du défaut par artisan est portée par les write
 * use-cases. Repo injecté.
 */
export function createModelesDevisRouter(repo: IModeleDevisRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listModelesDevis(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getModeleDevis(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerModeleDevis(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierModeleDevis(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerModeleDevis(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
