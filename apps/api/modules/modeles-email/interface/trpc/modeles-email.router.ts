import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IModeleEmailRepository } from "../../application/modele-email-repository";
import { listModelesEmail, modelesParType, getModeleEmail } from "../../application/read-use-cases";
import { creerModeleEmail, modifierModeleEmail, supprimerModeleEmail } from "../../application/write-use-cases";
import { TYPES_MODELE_EMAIL } from "../../domain/modele-email";

// Enum zod aligné sur le domaine (tuple réutilisé, jamais redéclaré). z.enum exige un tuple.
const typeSchema = z.enum(TYPES_MODELE_EMAIL);

// Bornes alignées sur la table `modeles_email` (defense-in-depth).
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

// Routeur tRPC du domaine modeles-email. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors (NotFound→404,
// Validation→400). L'unicité du défaut par type est portée par les write use-cases. Repo injecté.
export function createModelesEmailRouter(repo: IModeleEmailRepository) {
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
      .mutation(({ ctx, input }) => creerModeleEmail(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierModeleEmail(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerModeleEmail(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
