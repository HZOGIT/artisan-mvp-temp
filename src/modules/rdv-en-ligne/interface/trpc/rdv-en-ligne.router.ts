import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IRdvRepository } from "../../application/rdv-repository";
import { listRdvs, getRdv } from "../../application/read-use-cases";
import { creerRdv, modifierRdv, supprimerRdv } from "../../application/write-use-cases";

const urgenceEnum = z.enum(["normale", "urgente", "tres_urgente"]);
// `dateProposee` arrive en string ISO (transport JSON) ; `z.coerce.date()` la convertit en Date pour
// le domaine (le use-case revalide qu'elle est valide).

// Bornes alignées sur la table `rdv_en_ligne` (defense-in-depth). ⚠️ Le client NE fournit PAS
// `statut`/`motifRefus` (état machine → transitions dédiées en 7/9), ni `interventionId`.
const createSchema = z.object({
  clientId: z.number().int(),
  titre: z.string().min(1).max(255),
  dateProposee: z.coerce.date(),
  description: z.string().max(5000).nullish(),
  dureeEstimee: z.number().int().min(1).optional(),
  urgence: urgenceEnum.optional(),
});

const updateSchema = z.object({
  titre: z.string().min(1).max(255).optional(),
  dateProposee: z.coerce.date().optional(),
  description: z.string().max(5000).nullish(),
  dureeEstimee: z.number().int().min(1).optional(),
  urgence: urgenceEnum.optional(),
});

// Routeur tRPC du domaine rdv-en-ligne. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant via ctx.tenant + anti-IDOR clientId au use-case), laisse remonter les
// Domain errors (NotFound→404, Validation→400). ⚠️ Les transitions de statut (confirmer/refuser/
// annuler) seront exposées en 7/9 (procédures dédiées). Repo injecté.
export function createRdvEnLigneRouter(repo: IRdvRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listRdvs(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getRdv(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerRdv(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierRdv(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerRdv(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
