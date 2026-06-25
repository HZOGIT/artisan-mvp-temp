import { z } from "zod";
import { router, protectedProcedure, permissionProcedure } from "../../../../interface/trpc/trpc";
import type { ICongeRepository } from "../../application/conge-repository";
import { listConges, listCongesEnAttente, getConge, getSoldeConge } from "../../application/read-use-cases";
import {
  creerConge,
  modifierConge,
  supprimerConge,
  approuverConge,
  refuserConge,
  annulerConge,
} from "../../application/write-use-cases";

const typeEnum = z.enum(["conge_paye", "rtt", "maladie", "sans_solde", "formation", "autre"]);
/** Date PG `date` au format ISO `YYYY-MM-DD`. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");

/*
 * ⚠️ `statut`/`validePar`/`dateValidation` ABSENTS de create/update : ils ne changent que via
 * le workflow d'approbation (anti self-approbation + solde), étape ultérieure.
 */
const createSchema = z.object({
  technicienId: z.number().int(),
  type: typeEnum,
  dateDebut: isoDate,
  dateFin: isoDate,
  demiJourneeDebut: z.boolean().optional(),
  demiJourneeFin: z.boolean().optional(),
  motif: z.string().max(2000).nullish(),
});

const updateSchema = z.object({
  type: typeEnum.optional(),
  dateDebut: isoDate.optional(),
  dateFin: isoDate.optional(),
  demiJourneeDebut: z.boolean().optional(),
  demiJourneeFin: z.boolean().optional(),
  motif: z.string().max(2000).nullish(),
});

const gerer = permissionProcedure("conges.gerer");

/*
 * Routeur tRPC du domaine conges (RH). Transport mince : valide les inputs (zod), délègue aux
 * use-cases (scoping tenant + anti-IDOR-FK via ctx.tenant), laisse remonter les Domain errors
 * (NotFound→404, Validation→400). Repo injecté (DI).
 */
export function createCongesRouter(repo: ICongeRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listConges(repo, ctx.tenant)),

    /** Demandes en attente (vue manager/approbateur), scopées tenant (parité client trpc.conges.enAttente). */
    enAttente: protectedProcedure.query(({ ctx }) => listCongesEnAttente(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getConge(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        const result = await creerConge(repo, ctx.tenant, input);
        ctx.log.info({ event: "conge_demande", congeId: result.id, technicienId: input.technicienId, type: input.type, dateDebut: input.dateDebut, dateFin: input.dateFin }, "Congé demandé");
        return result;
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierConge(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerConge(repo, ctx.tenant, input.id);
        ctx.log.warn({ event: "conge_supprime", congeId: input.id }, "Congé supprimé");
        return { success: true };
      }),

    /** Workflow d'approbation. ⚠️ anti self-approbation porté par le use-case (403 si self). Gate : conges.gerer. */
    approuver: gerer
      .input(z.object({ id: z.number().int(), commentaire: z.string().max(2000).nullish() }))
      .mutation(async ({ ctx, input }) => {
        const result = await approuverConge(repo, ctx.tenant, input.id, input.commentaire);
        ctx.log.info({ event: "conge_approuve", congeId: input.id }, "Congé approuvé");
        return result;
      }),

    refuser: gerer
      .input(z.object({ id: z.number().int(), commentaire: z.string().max(2000).nullish() }))
      .mutation(async ({ ctx, input }) => {
        const result = await refuserConge(repo, ctx.tenant, input.id, input.commentaire);
        ctx.log.warn({ event: "conge_refuse", congeId: input.id }, "Congé refusé");
        return result;
      }),

    annuler: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await annulerConge(repo, ctx.tenant, input.id);
        ctx.log.warn({ event: "conge_annule", congeId: input.id }, "Congé annulé");
        return result;
      }),

    getSolde: protectedProcedure
      .input(z.object({ technicienId: z.number().int(), annee: z.number().int().optional() }))
      .query(({ ctx, input }) =>
        getSoldeConge(repo, ctx.tenant, input.technicienId, input.annee ?? new Date().getFullYear()),
      ),
  });
}
