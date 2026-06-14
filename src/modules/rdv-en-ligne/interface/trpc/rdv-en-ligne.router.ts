import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IRdvRepository } from "../../application/rdv-repository";
import type { IInterventionRepository } from "../../../interventions/application/intervention-repository";
import { listRdvs, getRdv, getRdvStats, getRdvPendingCount } from "../../application/read-use-cases";
import { creerRdv, modifierRdv, supprimerRdv } from "../../application/write-use-cases";
import { confirmerRdv, refuserRdv, annulerRdv } from "../../application/transition-use-cases";
import { confirmerRdvAvecIntervention } from "../../application/confirm-use-cases";

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
export function createRdvEnLigneRouter(repo: IRdvRepository, interventionRepo: IInterventionRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listRdvs(repo, ctx.tenant)),

    // Comptes par statut + nombre en attente (parité client trpc.rdv.getStats / getPendingCount).
    getStats: protectedProcedure.query(({ ctx }) => getRdvStats(repo, ctx.tenant)),

    getPendingCount: protectedProcedure.query(({ ctx }) => getRdvPendingCount(repo, ctx.tenant)),

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

    // Transitions de statut (état machine) — chacune valide la légalité depuis le statut courant.
    confirmer: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => confirmerRdv(repo, ctx.tenant, input.id)),

    // Confirmation « métier » (parité client `trpc.rdv.confirm`) : crée l'intervention planifiée +
    // passe le RDV à confirme avec le lien interventionId. Garde en_attente (sinon 400).
    confirm: protectedProcedure
      .input(z.object({ rdvId: z.number().int() }))
      .mutation(({ ctx, input }) => confirmerRdvAvecIntervention(repo, interventionRepo, ctx.tenant, input.rdvId)),

    refuser: protectedProcedure
      .input(z.object({ id: z.number().int(), motifRefus: z.string().min(1).max(5000) }))
      .mutation(({ ctx, input }) => refuserRdv(repo, ctx.tenant, input.id, input.motifRefus)),

    annuler: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => annulerRdv(repo, ctx.tenant, input.id)),
  });
}
