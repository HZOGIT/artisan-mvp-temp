import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IPrevisionCARepository } from "../../application/prevision-ca-repository";
import { listPrevisions, previsionsParAnnee, getPrevision } from "../../application/read-use-cases";
import { creerPrevision, modifierPrevision, supprimerPrevision } from "../../application/write-use-cases";

const methode = z.enum(["moyenne_mobile", "regression_lineaire", "saisonnalite", "manuel"]);
const montantPos = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant positif décimal invalide");
const montantSigne = z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Montant décimal invalide");

// Bornes alignées sur la table `previsions_ca` (defense-in-depth).
const createSchema = z.object({
  mois: z.number().int().min(1).max(12),
  annee: z.number().int().min(2000).max(2100),
  caPrevisionnel: montantPos.optional(),
  caRealise: montantPos.optional(),
  ecart: montantSigne.optional(),
  ecartPourcentage: montantSigne.optional(),
  methodeCalcul: methode.optional(),
  confiance: montantPos.nullish(),
});

// ⚠️ Montants/méthode/confiance seuls — `mois`/`annee` sont la période immuable (changer = supprimer + recréer).
const updateSchema = z.object({
  caPrevisionnel: montantPos.optional(),
  caRealise: montantPos.optional(),
  ecart: montantSigne.optional(),
  ecartPourcentage: montantSigne.optional(),
  methodeCalcul: methode.optional(),
  confiance: montantPos.nullish(),
});

// Routeur tRPC du domaine previsions-ca (prévisions de CA par période). Transport mince : valide les
// inputs (zod), délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain
// errors (NotFound→404, Validation→400). Repo injecté.
export function createPrevisionsCARouter(repo: IPrevisionCARepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listPrevisions(repo, ctx.tenant)),

    byAnnee: protectedProcedure
      .input(z.object({ annee: z.number().int() }))
      .query(({ ctx, input }) => previsionsParAnnee(repo, ctx.tenant, input.annee)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getPrevision(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerPrevision(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierPrevision(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerPrevision(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
