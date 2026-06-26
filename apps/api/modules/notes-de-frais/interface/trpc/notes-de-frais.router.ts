import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { INoteDeFraisRepository } from "../../application/note-de-frais-repository";
import { listNotesDeFrais, getNoteDeFrais } from "../../application/read-use-cases";
import {
  creerNoteDeFrais,
  modifierNoteDeFrais,
  supprimerNoteDeFrais,
  soumettreNoteDeFrais,
  approuverNoteDeFrais,
  rejeterNoteDeFrais,
  payerNoteDeFrais,
  ajouterDepenseANote,
  retirerDepenseDeNote,
} from "../../application/write-use-cases";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");

/*
 * ⚠️ `userId`/`statut`/dates workflow ABSENTS de create/update : `userId` est forcé à
 * l'utilisateur courant par le use-case ; le statut ne change que via le workflow.
 */
const createSchema = z.object({
  numero: z.string().min(1).max(20),
  titre: z.string().min(1).max(255),
  periodeDebut: isoDate,
  periodeFin: isoDate,
  montantTotal: decimal.optional(),
  montantRembourse: decimal.optional(),
});

const updateSchema = z.object({
  titre: z.string().min(1).max(255).optional(),
  periodeDebut: isoDate.optional(),
  periodeFin: isoDate.optional(),
  montantTotal: decimal.optional(),
  montantRembourse: decimal.optional(),
});

/*
 * Routeur tRPC du domaine notes-de-frais. Transport mince : valide les inputs (zod), délègue
 * aux use-cases (scoping tenant + userId forcé via ctx.tenant), laisse remonter les Domain
 * errors (NotFound→404, Validation→400). Repo injecté (DI).
 */
export function createNotesDeFraisRouter(repo: INoteDeFraisRepository, db?: DbClient) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listNotesDeFrais(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getNoteDeFrais(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerNoteDeFrais(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "note_de_frais.creee", entityType: "note_de_frais", entityId: result.id, payload: { titre: result.titre, artisanId: result.artisanId } });
          return result;
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierNoteDeFrais(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "note_de_frais.modifiee", entityType: "note_de_frais", entityId: id, payload: { titre: result.titre } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerNoteDeFrais(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "note_de_frais.supprimee", entityType: "note_de_frais", entityId: input.id, payload: { snapshot: { noteId: input.id, titre: before?.titre } } });
          return { success: true };
        });
      }),

    /** Workflow d'approbation. ⚠️ anti self-approbation porté par le use-case (403 si self). */
    soumettre: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await soumettreNoteDeFrais(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "note_de_frais.soumise", entityType: "note_de_frais", entityId: input.id, payload: { montantTotal: result.montantTotal } });
          return result;
        });
      }),

    approuver: protectedProcedure
      .input(z.object({ id: z.number().int(), commentaire: z.string().max(2000).nullish() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await approuverNoteDeFrais(r, ctx.tenant, input.id, input.commentaire);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "note_de_frais.approuvee", entityType: "note_de_frais", entityId: input.id, payload: { noteId: input.id } });
          return result;
        });
      }),

    rejeter: protectedProcedure
      .input(z.object({ id: z.number().int(), commentaire: z.string().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await rejeterNoteDeFrais(r, ctx.tenant, input.id, input.commentaire);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "note_de_frais.rejetee", entityType: "note_de_frais", entityId: input.id, payload: { motif: input.commentaire } });
          return result;
        });
      }),

    payer: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await payerNoteDeFrais(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "note_de_frais.payee", entityType: "note_de_frais", entityId: input.id, payload: { montantTotal: result.montantTotal } });
          return result;
        });
      }),

    ajouterDepense: protectedProcedure
      .input(z.object({ noteId: z.number().int(), depenseId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await ajouterDepenseANote(r, ctx.tenant, input.noteId, input.depenseId);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "note_de_frais.depense_ajoutee", entityType: "note_de_frais", entityId: input.noteId, payload: { depenseId: input.depenseId } });
          return result;
        });
      }),

    retirerDepense: protectedProcedure
      .input(z.object({ noteId: z.number().int(), depenseId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await retirerDepenseDeNote(r, ctx.tenant, input.noteId, input.depenseId);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "note_de_frais.depense_retiree", entityType: "note_de_frais", entityId: input.noteId, payload: { depenseId: input.depenseId } });
          return result;
        });
      }),
  });
}
