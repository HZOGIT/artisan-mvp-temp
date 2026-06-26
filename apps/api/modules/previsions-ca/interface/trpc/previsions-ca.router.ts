import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IPrevisionCARepository } from "../../application/prevision-ca-repository";
import { listPrevisions, previsionsParAnnee, getPrevision, getPrevisions, getHistorique, getComparaison } from "../../application/read-use-cases";
import { creerPrevision, modifierPrevision, supprimerPrevision } from "../../application/write-use-cases";
import { calculerPrevisions } from "../../application/calculer-use-case";
import { getTresoreriePrevisionnelle } from "../../application/tresorerie-use-case";
import type { FacturesCAReader } from "../../application/factures-ca-reader";
import type { TresorerieReader } from "../../application/tresorerie-reader";

const methode = z.enum(["moyenne_mobile", "regression_lineaire", "saisonnalite", "manuel"]);
const montantPos = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant positif décimal invalide");
const montantSigne = z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Montant décimal invalide");

/** Bornes alignées sur la table `previsions_ca` (defense-in-depth). */
const createSchema = z.object({
  mois: z.number().int().min(1).max(12),
  annee: z.number().int().min(2000).max(2100),
  caPrevisionnel: montantPos.optional(),
  caRealise: montantPos.optional(),
  ecart: montantSigne.optional(),
  ecartPourcentage: montantSigne.optional(),
  methodeCalcul: methode.optional(),
  confiance: montantPos.nullish(),
});

/** ⚠️ Montants/méthode/confiance seuls — `mois`/`annee` sont la période immuable (changer = supprimer + recréer). */
const updateSchema = z.object({
  caPrevisionnel: montantPos.optional(),
  caRealise: montantPos.optional(),
  ecart: montantSigne.optional(),
  ecartPourcentage: montantSigne.optional(),
  methodeCalcul: methode.optional(),
  confiance: montantPos.nullish(),
});

/*
 * Routeur tRPC du domaine previsions-ca (prévisions de CA par période). Transport mince : valide les
 * inputs (zod), délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain
 * errors (NotFound→404, Validation→400). Repo injecté.
 */
export function createPrevisionsCARouter(repo: IPrevisionCARepository, facturesCAReader?: FacturesCAReader, tresorerieReader?: TresorerieReader, db?: DbClient) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listPrevisions(repo, ctx.tenant)),

    byAnnee: protectedProcedure
      .input(z.object({ annee: z.number().int() }))
      .query(({ ctx, input }) => previsionsParAnnee(repo, ctx.tenant, input.annee)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getPrevision(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerPrevision(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "prevision_ca.creee", entityType: "prevision_ca", entityId: result.id, payload: { previsionId: result.id, mois: result.mois, montantPrevu: result.caPrevisionnel } });
          return result;
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const champsModifies = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierPrevision(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "prevision_ca.modifiee", entityType: "prevision_ca", entityId: id, payload: { previsionId: id, champsModifies } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerPrevision(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "prevision_ca.supprimee", entityType: "prevision_ca", entityId: input.id, payload: { snapshot: { previsionId: input.id, mois: before?.mois } } });
          return { success: true };
        });
      }),

    /*
     * ── Surface parité client (forecasting) — lectures ───────────────────────────────────────────
     * `getPrevisions {annee?}` : prévisions de l'année (défaut année courante).
     */
    getPrevisions: protectedProcedure
      .input(z.object({ annee: z.number().int().min(2000).max(2100) }).optional())
      .query(({ ctx, input }) => getPrevisions(repo, ctx.tenant, input?.annee)),

    /** `getHistorique {nombreMois=24}` : historique de CA mensuel agrégé (récent d'abord). */
    getHistorique: protectedProcedure
      .input(z.object({ nombreMois: z.number().int().min(1).max(120).default(24) }).optional())
      .query(({ ctx, input }) => getHistorique(repo, ctx.tenant, input?.nombreMois ?? 24)),

    /** `getComparaison {annee}` : prévu (previsions_ca) vs réalisé (historique_ca), mois par mois. */
    getComparaison: protectedProcedure
      .input(z.object({ annee: z.number().int().min(2000).max(2100) }))
      .query(({ ctx, input }) => getComparaison(repo, ctx.tenant, input.annee)),

    /*
     * `calculer {methode}` (mutation) : recalcule l'historique depuis les factures payées, puis
     * projette les prévisions de l'année courante. Sans reader CA → message « pas assez de données ».
     */
    calculer: protectedProcedure
      .input(z.object({ methode: z.enum(["moyenne_mobile", "regression_lineaire", "saisonnalite"]).default("moyenne_mobile") }))
      .mutation(({ ctx, input }) =>
        facturesCAReader
          ? calculerPrevisions({ repo, facturesReader: facturesCAReader }, ctx.tenant, input.methode)
          : Promise.resolve({ message: "Pas assez de données historiques pour calculer les prévisions" }),
      ),

    /** `getTresoreriePrevisionnelle {semaines=8}` : flux net hebdo (encaissements − décaissements). */
    getTresoreriePrevisionnelle: protectedProcedure
      .input(z.object({ semaines: z.number().int().min(1).max(26).default(8) }).optional())
      .query(({ ctx, input }) => getTresoreriePrevisionnelle(tresorerieReader, ctx.tenant, input?.semaines ?? 8)),
  });
}
