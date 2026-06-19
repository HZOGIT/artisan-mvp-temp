import { z } from "zod";
import { router, permissionProcedure } from "../../../../interface/trpc/trpc";

/*
 * Tout le routeur rdv exige `rdv.gerer` (parité legacy ; pas de permission `rdv.voir` distincte).
 * Le propriétaire l'a (ALL_PERMISSIONS au provisioning) ; un collaborateur sans la permission → 403.
 */
const gerer = permissionProcedure("rdv.gerer");
import type { IRdvRepository } from "../../application/rdv-repository";
import type { IInterventionRepository } from "../../../interventions/application/intervention-repository";
import type { IClientRepository } from "../../../clients/application/client-repository";
import { getRdv, getRdvStats, getRdvPendingCount, listRdvsAvecClient } from "../../application/read-use-cases";
import { creerRdv, modifierRdv, supprimerRdv } from "../../application/write-use-cases";
import { confirmerRdv, refuserRdv, annulerRdv } from "../../application/transition-use-cases";
import { confirmerRdvAvecIntervention } from "../../application/confirm-use-cases";
import { proposerAutreCreneau } from "../../application/propose-use-cases";

const urgenceEnum = z.enum(["normale", "urgente", "tres_urgente"]);
/*
 * `dateProposee` arrive en string ISO (transport JSON) ; `z.coerce.date()` la convertit en Date pour
 * le domaine (le use-case revalide qu'elle est valide).
 */

/*
 * Bornes alignées sur la table `rdv_en_ligne` (defense-in-depth). ⚠️ Le client NE fournit PAS
 * `statut`/`motifRefus` (état machine → transitions dédiées en 7/9), ni `interventionId`.
 */
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

/*
 * Routeur tRPC du domaine rdv-en-ligne. Transport mince : valide les inputs (zod), délègue aux
 * use-cases (scoping tenant via ctx.tenant + anti-IDOR clientId au use-case), laisse remonter les
 * Domain errors (NotFound→404, Validation→400). ⚠️ Les transitions de statut (confirmer/refuser/
 * annuler) seront exposées en 7/9 (procédures dédiées). Repo injecté.
 */
export function createRdvEnLigneRouter(
  repo: IRdvRepository,
  interventionRepo: IInterventionRepository,
  clientRepo: IClientRepository,
) {
  return router({
    /** Liste enrichie du `client` (parité legacy — le client UI lit `rdv.client.prenom/nom`). */
    list: gerer.query(({ ctx }) => listRdvsAvecClient(repo, clientRepo, ctx.tenant)),

    /** Comptes par statut + nombre en attente (parité client trpc.rdv.getStats / getPendingCount). */
    getStats: gerer.query(({ ctx }) => getRdvStats(repo, ctx.tenant)),

    getPendingCount: gerer.query(({ ctx }) => getRdvPendingCount(repo, ctx.tenant)),

    getById: gerer
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getRdv(repo, ctx.tenant, input.id)),

    create: gerer
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        const result = await creerRdv(repo, ctx.tenant, input);
        const level = input.urgence === "tres_urgente" ? "warn" : "info";
        ctx.log[level]({ event: "rdv_cree", rdvId: result.id, clientId: input.clientId, urgence: input.urgence ?? "normale" }, "RDV en ligne créé");
        return result;
      }),

    update: gerer
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierRdv(repo, ctx.tenant, id, data);
      }),

    delete: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerRdv(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    /** Transitions de statut (état machine) — chacune valide la légalité depuis le statut courant. */
    confirmer: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await confirmerRdv(repo, ctx.tenant, input.id);
        ctx.log.info({ event: "rdv_confirme", rdvId: input.id }, "RDV confirmé");
        return result;
      }),

    confirm: gerer
      .input(z.object({ rdvId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await confirmerRdvAvecIntervention(repo, interventionRepo, ctx.tenant, input.rdvId);
        ctx.log.info({ event: "rdv_confirme_avec_intervention", rdvId: input.rdvId }, "RDV confirmé + intervention créée");
        return result;
      }),

    refuse: gerer
      .input(z.object({ rdvId: z.number().int(), motif: z.string().min(1).max(5000) }))
      .mutation(async ({ ctx, input }) => {
        const result = await refuserRdv(repo, ctx.tenant, input.rdvId, input.motif);
        ctx.log.warn({ event: "rdv_refuse", rdvId: input.rdvId }, "RDV refusé");
        return result;
      }),

    proposeAutreCreneau: gerer
      .input(z.object({ rdvId: z.number().int(), nouvelleDateProposee: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const result = await proposerAutreCreneau(repo, ctx.tenant, input.rdvId, input.nouvelleDateProposee);
        ctx.log.info({ event: "rdv_autre_creneau_propose", rdvId: input.rdvId }, "Autre créneau proposé au client");
        return result;
      }),

    refuser: gerer
      .input(z.object({ id: z.number().int(), motifRefus: z.string().min(1).max(5000) }))
      .mutation(async ({ ctx, input }) => {
        const result = await refuserRdv(repo, ctx.tenant, input.id, input.motifRefus);
        ctx.log.warn({ event: "rdv_refuse", rdvId: input.id }, "RDV refusé");
        return result;
      }),

    annuler: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await annulerRdv(repo, ctx.tenant, input.id);
        ctx.log.warn({ event: "rdv_annule", rdvId: input.id }, "RDV annulé");
        return result;
      }),
  });
}
