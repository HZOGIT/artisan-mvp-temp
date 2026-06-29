import { z } from "zod";
import { router, protectedProcedure, permissionProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { ICongeRepository } from "../../application/conge-repository";
import { listConges, listCongesEnAttente, getConge, getSoldeConge, listSoldesConges, cloturerPeriode } from "../../application/read-use-cases";
import { exerciceCourant } from "../../application/solde";
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
export function createCongesRouter(repo: ICongeRepository, db?: DbClient) {
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
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerConge(r, ctx.tenant, input);
          ctx.log.info({ event: "conge_demande", congeId: result.id, technicienId: input.technicienId, type: input.type, dateDebut: input.dateDebut, dateFin: input.dateFin }, "Congé demandé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "conge.cree", entityType: "conge", entityId: result.id, payload: { type: result.type, dateDebut: result.dateDebut, dateFin: result.dateFin, technicienId: result.technicienId } });
          return result;
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierConge(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "conge.modifie", entityType: "conge", entityId: id, payload: { congeId: id } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerConge(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "conge_supprime", congeId: input.id }, "Congé supprimé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "conge.supprime", entityType: "conge", entityId: input.id, payload: { snapshot: { type: before?.type, technicienId: before?.technicienId } } });
          return { success: true };
        });
      }),

    /** Workflow d'approbation. ⚠️ anti self-approbation porté par le use-case (403 si self). Gate : conges.gerer. */
    approuver: gerer
      .input(z.object({ id: z.number().int(), commentaire: z.string().max(2000).nullish() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await approuverConge(r, ctx.tenant, input.id, input.commentaire);
          ctx.log.info({ event: "conge_approuve", congeId: input.id }, "Congé approuvé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "conge.approuve", entityType: "conge", entityId: input.id, payload: { avant: { statut: "en_attente" }, apres: { statut: result.statut } } });
          return result;
        });
      }),

    refuser: gerer
      .input(z.object({ id: z.number().int(), commentaire: z.string().max(2000).nullish() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await refuserConge(r, ctx.tenant, input.id, input.commentaire);
          ctx.log.warn({ event: "conge_refuse", congeId: input.id }, "Congé refusé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "conge.refuse", entityType: "conge", entityId: input.id, payload: { avant: { statut: "en_attente" }, apres: { statut: result.statut }, motif: input.commentaire ?? null } });
          return result;
        });
      }),

    annuler: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await annulerConge(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "conge_annule", congeId: input.id }, "Congé annulé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "conge.annule", entityType: "conge", entityId: input.id, payload: { avant: { statut: result.statut !== "annule" ? result.statut : undefined }, apres: { statut: "annule" } } });
          return result;
        });
      }),

    /** Solde CP d'un technicien pour une période. `exercice` format « 2025-2026 », défaut = courant. */
    getSolde: protectedProcedure
      .input(z.object({
        technicienId: z.number().int(),
        exercice: z.string().regex(/^\d{4}-\d{4}$/).optional(),
      }))
      .query(({ ctx, input }) => {
        const ex = input.exercice ?? exerciceCourant();
        const periodeDebut = `${Number(ex.split("-")[0])}-06-01`;
        return getSoldeConge(repo, ctx.tenant, input.technicienId, periodeDebut);
      }),

    /** Soldes CP de tous les techniciens du tenant — calcul à la lecture (idempotent). */
    soldesTous: protectedProcedure
      .input(z.object({
        /** Format « 2025-2026 ». Défaut = exercice courant. */
        exercice: z.string().regex(/^\d{4}-\d{4}$/).optional(),
      }))
      .query(({ ctx, input }) => {
        const ex = input.exercice ?? exerciceCourant();
        const periodeDebut = `${Number(ex.split("-")[0])}-06-01`;
        return listSoldesConges(repo, ctx.tenant, periodeDebut);
      }),

    /**
     * Clôture de période : calcule et écrit le report des CP non consommés vers la période
     * suivante. Idempotent. Gate : conges.gerer.
     * `exercice` format « 2025-2026 » (période à clôturer).
     */
    cloturerPeriode: gerer
      .input(z.object({ exercice: z.string().regex(/^\d{4}-\d{4}$/) }))
      .mutation(({ ctx, input }) => {
        const anneeDebut = Number(input.exercice.split("-")[0]);
        const periodeDebut = `${anneeDebut}-06-01`;
        return cloturerPeriode(repo, ctx.tenant, periodeDebut);
      }),
  });
}
