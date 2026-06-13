import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { INoteDeFraisRepository } from "../../application/note-de-frais-repository";
import { listNotesDeFrais, getNoteDeFrais } from "../../application/read-use-cases";
import {
  creerNoteDeFrais,
  modifierNoteDeFrais,
  supprimerNoteDeFrais,
} from "../../application/write-use-cases";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");

// ⚠️ `userId`/`statut`/dates workflow ABSENTS de create/update : `userId` est forcé à
// l'utilisateur courant par le use-case ; le statut ne change que via le workflow.
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

// Routeur tRPC du domaine notes-de-frais. Transport mince : valide les inputs (zod), délègue
// aux use-cases (scoping tenant + userId forcé via ctx.tenant), laisse remonter les Domain
// errors (NotFound→404, Validation→400). Repo injecté (DI).
export function createNotesDeFraisRouter(repo: INoteDeFraisRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listNotesDeFrais(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getNoteDeFrais(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerNoteDeFrais(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierNoteDeFrais(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerNoteDeFrais(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
