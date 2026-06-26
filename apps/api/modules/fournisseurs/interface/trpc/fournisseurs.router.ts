import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IFournisseurRepository } from "../../application/fournisseur-repository";
import { listFournisseurs, getFournisseur } from "../../application/read-use-cases";
import { creerFournisseur, modifierFournisseur, supprimerFournisseur } from "../../application/write-use-cases";
import {
  listerFournisseursDeArticle,
  listerArticlesDeFournisseur,
  associerArticleFournisseur,
  dissocierArticleFournisseur,
} from "../../application/association-use-cases";

/** Bornes alignées sur la table `fournisseurs` (defense-in-depth). */
const createSchema = z.object({
  nom: z.string().min(1).max(255),
  contact: z.string().max(255).nullish(),
  email: z.string().email().max(320).nullish(),
  telephone: z.string().max(20).nullish(),
  adresse: z.string().max(500).nullish(),
  codePostal: z.string().max(10).nullish(),
  ville: z.string().max(100).nullish(),
  notes: z.string().max(5000).nullish(),
});

const updateSchema = z.object({
  nom: z.string().min(1).max(255).optional(),
  contact: z.string().max(255).nullish(),
  email: z.string().email().max(320).nullish(),
  telephone: z.string().max(20).nullish(),
  adresse: z.string().max(500).nullish(),
  codePostal: z.string().max(10).nullish(),
  ville: z.string().max(100).nullish(),
  notes: z.string().max(5000).nullish(),
});

/*
 * Routeur tRPC du domaine fournisseurs. Transport mince : valide les inputs (zod), délègue
 * aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
 * (NotFound→404, Validation→400). Repository injecté (DI) → testable.
 */
export function createFournisseursRouter(repo: IFournisseurRepository, db?: DbClient) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listFournisseurs(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getFournisseur(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerFournisseur(r, ctx.tenant, input);
          ctx.log.info({ event: "fournisseur_cree", fournisseurId: result.id, hasEmail: input.email != null }, "Fournisseur créé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "fournisseur.cree", entityType: "fournisseur", entityId: result.id, payload: { nom: result.nom } });
          return result;
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierFournisseur(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "fournisseur.modifie", entityType: "fournisseur", entityId: id, payload: { nom: result.nom } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerFournisseur(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "fournisseur_supprime", fournisseurId: input.id }, "Fournisseur supprimé — commandes liées potentiellement orphelines");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "fournisseur.supprime", entityType: "fournisseur", entityId: input.id, payload: { snapshot: { fournisseurId: input.id, nom: before?.nom ?? null } } });
          return { success: true };
        });
      }),

    /** ── Associations article↔fournisseur (prix d'achat, données tenant-privées) ── */
    getArticleFournisseurs: protectedProcedure
      .input(z.object({ articleId: z.number().int() }))
      .query(({ ctx, input }) => listerFournisseursDeArticle(repo, ctx.tenant, input.articleId)),

    getFournisseurArticles: protectedProcedure
      .input(z.object({ fournisseurId: z.number().int() }))
      .query(({ ctx, input }) => listerArticlesDeFournisseur(repo, ctx.tenant, input.fournisseurId)),

    associateArticle: protectedProcedure
      .input(
        z.object({
          articleId: z.number().int(),
          fournisseurId: z.number().int(),
          referenceExterne: z.string().max(100).nullish(),
          prixAchat: z.string().regex(/^\d+(\.\d{1,2})?$/, "Prix d'achat invalide").nullish(),
          delaiLivraison: z.number().int().min(0).nullish(),
        }),
      )
      .mutation(({ ctx, input }) => associerArticleFournisseur(repo, ctx.tenant, input)),

    dissociateArticle: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await dissocierArticleFournisseur(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
