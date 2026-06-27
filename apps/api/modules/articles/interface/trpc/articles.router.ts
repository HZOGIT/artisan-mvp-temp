import { z } from "zod";
import { router, protectedProcedure, publicProcedure, adminProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IArticleRepository } from "../../application/article-repository";
import { listArticles, getArticle, articlesParCategorie } from "../../application/read-use-cases";
import { creerArticle, modifierArticle, supprimerArticle } from "../../application/write-use-cases";
import { suggererArticlesIA, type ArticlesIaDeps } from "../../application/suggerer-articles-ia";
import type { AppLogger } from "../../../../shared/ports/logger";
import type { BibliothequeReader } from "../../application/bibliotheque-reader";
import type { BibliothequeWriter } from "../../application/bibliotheque-writer";
import {
  getBibliotheque,
  rechercherBibliotheque,
  creerArticleBibliotheque,
  modifierArticleBibliotheque,
  supprimerArticleBibliotheque,
  importerArticlesBibliotheque,
} from "../../application/bibliotheque-use-cases";

const biblioDecimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");

const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");

/** Bornes alignées sur la table `articles_artisan` (defense-in-depth). */
const createSchema = z.object({
  reference: z.string().min(1).max(50),
  designation: z.string().min(1).max(500),
  prixUnitaireHT: decimal,
  description: z.string().max(5000).nullish(),
  unite: z.string().max(20).optional(),
  tauxTVA: decimal.optional(),
  prixRevientHT: decimal.optional(),
  categorie: z.string().max(100).nullish(),
});

const updateSchema = z.object({
  reference: z.string().min(1).max(50).optional(),
  designation: z.string().min(1).max(500).optional(),
  prixUnitaireHT: decimal.optional(),
  description: z.string().max(5000).nullish(),
  unite: z.string().max(20).optional(),
  tauxTVA: decimal.optional(),
  prixRevientHT: decimal.optional(),
  categorie: z.string().max(100).nullish(),
});

/*
 * Routeur tRPC du domaine articles (catalogue). Transport mince : valide les inputs (zod), délègue
 * aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors (NotFound→404,
 * Validation→400). Repo injecté (DI).
 * Schéma d'un article de bibliothèque côté client (clés legacy snake_case : prix_base/sous_categorie).
 */
const biblioCreateSchema = z.object({
  nom: z.string().min(1).max(255),
  description: z.string().max(5000).nullish(),
  unite: z.string().min(1).max(50),
  prix_base: biblioDecimal,
  tauxTVA: biblioDecimal.optional(),
  prixRevient: biblioDecimal.optional(),
  categorie: z.string().min(1).max(50),
  sous_categorie: z.string().min(1).max(100),
  metier: z.string().min(1).max(50),
});

type BiblioClientInput = z.infer<typeof biblioCreateSchema>;
/** Mappe les clés client (snake_case) vers l'input domaine (camelCase). */
function toBiblioInput(i: BiblioClientInput) {
  return {
    nom: i.nom,
    description: i.description ?? null,
    unite: i.unite,
    prixBase: i.prix_base,
    tauxTVA: i.tauxTVA ?? null,
    prixRevient: i.prixRevient ?? null,
    categorie: i.categorie,
    sousCategorie: i.sous_categorie,
    metier: i.metier,
  };
}

export function createArticlesRouter(
  repo: IArticleRepository,
  ia?: ArticlesIaDeps,
  bibliotheque?: BibliothequeReader,
  bibliothequeWriter?: BibliothequeWriter,
  db?: DbClient,
) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listArticles(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getArticle(repo, ctx.tenant, input.id)),

    byCategorie: protectedProcedure
      .input(z.object({ categorie: z.string().min(1).max(100) }))
      .query(({ ctx, input }) => articlesParCategorie(repo, ctx.tenant, input.categorie)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) =>
        withOutbox(db, repo, async (r, tx) => {
          const result = await creerArticle(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "article.cree", entityType: "article", entityId: result.id, payload: { articleId: result.id, reference: result.reference, designation: result.designation, prixUnitaire: result.prixUnitaireHT } });
          return result;
        }),
      ),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierArticle(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "article.modifie", entityType: "article", entityId: id, payload: { articleId: id } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) =>
        withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerArticle(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "article.supprime", entityType: "article", entityId: input.id, payload: { snapshot: { articleId: input.id, reference: before?.reference, designation: before?.designation } } });
          return { success: true };
        }),
      ),

    /*
     * ── Surface parité client : articles « artisan » (catalogue propre au tenant) ─────────────────
     * Le client appelle ces clés (cf. legacy `articlesRouter`). Mêmes use-cases tenant-scopés que
     * list/create/update/delete (anti-IDOR via ctx.tenant ; 404 hors tenant).
     */
    getArtisanArticles: protectedProcedure.query(({ ctx }) => listArticles(repo, ctx.tenant)),

    createArtisanArticle: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) =>
        withOutbox(db, repo, async (r, tx) => {
          const result = await creerArticle(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "article.cree", entityType: "article", entityId: result.id, payload: { articleId: result.id, reference: result.reference, designation: result.designation, prixUnitaire: result.prixUnitaireHT } });
          return result;
        }),
      ),

    updateArtisanArticle: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierArticle(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "article.modifie", entityType: "article", entityId: id, payload: { articleId: id } });
          return result;
        });
      }),

    deleteArtisanArticle: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) =>
        withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerArticle(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "article.supprime", entityType: "article", entityId: input.id, payload: { snapshot: { articleId: input.id, reference: before?.reference, designation: before?.designation } } });
          return { success: true };
        }),
      ),

    /*
     * ── Suggestion IA d'articles (lecture seule, non persistée) ───────────────────────────────────
     * Parité legacy : dégradation silencieuse → [] si le seam IA n'est pas câblé, rate-limit atteint,
     * ou réponse non parsable (jamais d'erreur remontée au client).
     */
    suggererArticlesIA: protectedProcedure
      .input(z.object({ query: z.string().min(2).max(200), contexte: z.string().max(2000).optional() }))
      .query(({ ctx, input }) => (ia ? suggererArticlesIA(ia, ctx.tenant, input, ctx.log as unknown as AppLogger) : [])),

    /*
     * ── Bibliothèque PARTAGÉE (catalogue de référence) — lecture PUBLIQUE (non sensible) ──────────
     * Table `bibliotheque_articles` sans `artisanId` (RLS OFF). Sans reader câblé → [].
     */
    getBibliotheque: publicProcedure
      .input(z.object({ metier: z.string().max(50).optional(), categorie: z.string().max(50).optional() }).optional())
      .query(({ input }) => (bibliotheque ? getBibliotheque(bibliotheque, input ?? undefined) : [])),

    search: publicProcedure
      .input(z.object({ query: z.string().max(200), metier: z.string().max(50).optional() }))
      .query(({ input }) => (bibliotheque ? rechercherBibliotheque(bibliotheque, input.query, input.metier) : [])),

    /*
     * ── Bibliothèque WRITES — réservées au staff Operioz (adminProcedure → 403 sinon) ─────────────
     * Catalogue GLOBAL servi à tous les tenants : une écriture par un artisan le polluerait.
     */
    createBibliothequeArticle: adminProcedure
      .input(biblioCreateSchema)
      .mutation(({ input }) => {
        if (!bibliothequeWriter) throw new Error("Bibliothèque writer non configuré");
        return creerArticleBibliotheque(bibliothequeWriter, toBiblioInput(input));
      }),

    updateBibliothequeArticle: adminProcedure
      .input(
        z.object({
          id: z.number().int(),
          nom: z.string().min(1).max(255).optional(),
          description: z.string().max(5000).nullish(),
          unite: z.string().min(1).max(50).optional(),
          prix_base: biblioDecimal.optional(),
          tauxTVA: biblioDecimal.optional(),
          prixRevient: biblioDecimal.optional(),
          categorie: z.string().min(1).max(50).optional(),
          sous_categorie: z.string().min(1).max(100).optional(),
          metier: z.string().min(1).max(50).optional(),
        }),
      )
      .mutation(({ input }) => {
        if (!bibliothequeWriter) throw new Error("Bibliothèque writer non configuré");
        const { id, prix_base, sous_categorie, description, ...rest } = input;
        return modifierArticleBibliotheque(bibliothequeWriter, id, {
          ...rest,
          ...(prix_base !== undefined ? { prixBase: prix_base } : {}),
          ...(sous_categorie !== undefined ? { sousCategorie: sous_categorie } : {}),
          ...(description !== undefined ? { description } : {}),
        });
      }),

    deleteBibliothequeArticle: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        if (!bibliothequeWriter) throw new Error("Bibliothèque writer non configuré");
        await supprimerArticleBibliotheque(bibliothequeWriter, input.id);
        return { success: true };
      }),

    importBibliothequeArticles: adminProcedure
      .input(z.array(biblioCreateSchema).max(2000, "Import limité à 2000 articles par envoi"))
      .mutation(({ input }) => {
        if (!bibliothequeWriter) throw new Error("Bibliothèque writer non configuré");
        return importerArticlesBibliotheque(bibliothequeWriter, input.map(toBiblioInput));
      }),
  });
}
