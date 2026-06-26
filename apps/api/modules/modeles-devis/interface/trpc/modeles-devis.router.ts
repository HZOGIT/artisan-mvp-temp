import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IModeleDevisRepository } from "../../application/modele-devis-repository";
import { listModelesDevis, getModeleDevis } from "../../application/read-use-cases";
import { creerModeleDevis, modifierModeleDevis, supprimerModeleDevis, ajouterLigneModeleDevis } from "../../application/write-use-cases";

const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");

/*
 * Ligne de modèle (defense-in-depth aligné sur `modeles_devis_lignes`). Pas de montants dérivés
 * (gabarit) : seules les valeurs saisies sont bornées ; la validation métier fine est au use-case.
 */
const ligneSchema = z.object({
  articleId: z.number().int().nullish(),
  designation: z.string().min(1).max(255),
  description: z.string().max(5000).nullish(),
  quantite: decimal.optional(),
  unite: z.string().max(20).optional(),
  prixUnitaireHT: decimal.optional(),
  tauxTVA: decimal.optional(),
  remise: decimal.optional(),
  ordre: z.number().int().optional(),
});

const createSchema = z.object({
  nom: z.string().min(1).max(255),
  description: z.string().max(5000).nullish(),
  notes: z.string().max(5000).nullish(),
  isDefault: z.boolean().optional(),
  lignes: z.array(ligneSchema).optional(),
});

const updateSchema = z.object({
  nom: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullish(),
  notes: z.string().max(5000).nullish(),
  isDefault: z.boolean().optional(),
  /** si fourni → remplacement complet des lignes */
  lignes: z.array(ligneSchema).optional(),
});

/*
 * Routeur tRPC du domaine modeles-devis (agrégat en-tête + lignes). Transport mince : valide les
 * inputs (zod), délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain
 * errors (NotFound→404, Validation→400). L'unicité du défaut par artisan est portée par les write
 * use-cases. Repo injecté.
 */
export function createModelesDevisRouter(repo: IModeleDevisRepository, db?: DbClient) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listModelesDevis(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getModeleDevis(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) =>
        withOutbox(db, repo, async (r, tx) => {
          const result = await creerModeleDevis(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "modele_devis.cree", entityType: "modele_devis", entityId: result.id, payload: { nom: result.nom, isDefault: result.isDefault } });
          return result;
        }),
      ),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierModeleDevis(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "modele_devis.modifie", entityType: "modele_devis", entityId: id, payload: { nom: result.nom, isDefault: result.isDefault } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) =>
        withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerModeleDevis(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "modele_devis.supprime", entityType: "modele_devis", entityId: input.id, payload: { snapshot: { nom: before?.nom, isDefault: before?.isDefault } } });
          return { success: true };
        }),
      ),

    ajouterLigne: protectedProcedure
      .input(z.object({ modeleId: z.number().int() }).and(ligneSchema))
      .mutation(({ ctx, input }) => {
        const { modeleId, ...ligne } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await ajouterLigneModeleDevis(r, ctx.tenant, modeleId, ligne);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "modele_devis.ligne_ajoutee", entityType: "modele_devis", entityId: modeleId, payload: { ligneId: result.id, designation: result.designation } });
          return result;
        });
      }),
  });
}
