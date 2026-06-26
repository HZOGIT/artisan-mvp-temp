import { z } from "zod";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IModeleEmailRepository } from "../../application/modele-email-repository";
import { listModelesEmail, modelesParType, getModeleEmail } from "../../application/read-use-cases";
import { creerModeleEmail, modifierModeleEmail, supprimerModeleEmail } from "../../application/write-use-cases";
import { TYPES_MODELE_EMAIL } from "../../domain/modele-email";

/** Enum zod aligné sur le domaine (tuple réutilisé, jamais redéclaré). z.enum exige un tuple. */
const typeSchema = z.enum(TYPES_MODELE_EMAIL);

/** Bornes alignées sur la table `modeles_email` (defense-in-depth). */
const createSchema = z.object({
  nom: z.string().min(1).max(100),
  type: typeSchema,
  sujet: z.string().min(1).max(255),
  contenu: z.string().min(1).max(20000),
  isDefault: z.boolean().optional(),
});

const updateSchema = z.object({
  nom: z.string().min(1).max(100).optional(),
  type: typeSchema.optional(),
  sujet: z.string().min(1).max(255).optional(),
  contenu: z.string().min(1).max(20000).optional(),
  isDefault: z.boolean().optional(),
});

/*
 * Routeur tRPC du domaine modeles-email. Transport mince : valide les inputs (zod), délègue aux
 * use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors (NotFound→404,
 * Validation→400). L'unicité du défaut par type est portée par les write use-cases. Repo injecté.
 */
export function createModelesEmailRouter(repo: IModeleEmailRepository, db?: DbClient) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listModelesEmail(repo, ctx.tenant)),

    byType: protectedProcedure
      .input(z.object({ type: typeSchema }))
      .query(({ ctx, input }) => modelesParType(repo, ctx.tenant, input.type)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getModeleEmail(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) =>
        withOutbox(db, repo, async (r, tx) => {
          const result = await creerModeleEmail(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "modele_email.cree", entityType: "modele_email", entityId: result.id, payload: { nom: result.nom, sujet: result.sujet, typeModele: result.type, isDefault: result.isDefault } });
          return result;
        }),
      ),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierModeleEmail(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "modele_email.modifie", entityType: "modele_email", entityId: id, payload: { nom: result.nom, sujet: result.sujet, typeModele: result.type, isDefault: result.isDefault } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerModeleEmail(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "modele_email.supprime", entityType: "modele_email", entityId: input.id, payload: { snapshot: { nom: before?.nom, typeModele: before?.type } } });
          return { success: true };
        });
      }),
  });
}
