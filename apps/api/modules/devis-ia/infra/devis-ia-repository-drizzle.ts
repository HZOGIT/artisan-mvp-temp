import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { analysesPhotosChantier, photosAnalyse, resultatsAnalyseIA, suggestionsArticlesIA, devisGenereIA, clients, devis, devisLignes } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisIARepository, SaveResultatData, SaveSuggestionData } from "../application/devis-ia-repository";
import { genererLignesDevis } from "../domain/devis-ia";
import type { AddPhotoInput, Analyse, AnalyseDetail, CreateAnalyseInput, Photo, Resultat, ResultatAvecSuggestions, Suggestion, DevisGenere, UpdateSuggestionInput } from "../domain/devis-ia";

type AnalyseRow = typeof analysesPhotosChantier.$inferSelect;
type PhotoRow = typeof photosAnalyse.$inferSelect;
type ResultatRow = typeof resultatsAnalyseIA.$inferSelect;
type SuggestionRow = typeof suggestionsArticlesIA.$inferSelect;
type DevisRow = typeof devisGenereIA.$inferSelect;

const toAnalyse = (r: AnalyseRow): Analyse => ({ id: r.id, clientId: r.clientId ?? null, titre: r.titre ?? null, description: r.description ?? null, statut: r.statut ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt ?? null });
const toPhoto = (r: PhotoRow): Photo => ({ id: r.id, analyseId: r.analyseId, url: r.url, description: r.description ?? null, ordre: r.ordre ?? null, uploadedAt: r.uploadedAt ?? null });
const toResultat = (r: ResultatRow): Resultat => ({ id: r.id, analyseId: r.analyseId, typeTravauxDetecte: r.typeTravauxDetecte ?? null, descriptionTravaux: r.descriptionTravaux ?? null, urgence: r.urgence ?? null, confiance: r.confiance ?? null, createdAt: r.createdAt });
const toSuggestion = (r: SuggestionRow): Suggestion => ({ id: r.id, resultatId: r.resultatId, articleId: r.articleId ?? null, nomArticle: r.nomArticle ?? null, description: r.description ?? null, quantiteSuggeree: r.quantiteSuggeree ?? null, unite: r.unite ?? null, prixEstime: r.prixEstime ?? null, confiance: r.confiance ?? null, selectionne: r.selectionne ?? null, createdAt: r.createdAt });
const toDevis = (r: DevisRow): DevisGenere => ({ id: r.id, analyseId: r.analyseId, devisId: r.devisId ?? null, montantEstime: r.montantEstime ?? null, createdAt: r.createdAt });

// Repository Drizzle devis-IA. `analyses_photos_chantier` SOUS RLS (withTenant) ; les tables filles
// (sans artisanId) ne sont lues/écrites QUE pour des analyses du tenant déjà résolues → anti-IDOR par
// le parent. `updateSuggestionOwned` vérifie la chaîne suggestion→résultat→analyse(tenant).
export class DevisIARepositoryDrizzle implements IDevisIARepository {
  constructor(private readonly db: DbClient) {}

  listAnalyses(ctx: TenantContext): Promise<Analyse[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx.select().from(analysesPhotosChantier).where(eq(analysesPhotosChantier.artisanId, ctx.artisanId)).orderBy(desc(analysesPhotosChantier.createdAt));
      return rows.map(toAnalyse);
    });
  }

  getAnalyseOwned(ctx: TenantContext, analyseId: number): Promise<Analyse | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx.select().from(analysesPhotosChantier).where(and(eq(analysesPhotosChantier.id, analyseId), eq(analysesPhotosChantier.artisanId, ctx.artisanId))).limit(1);
      return r ? toAnalyse(r) : null;
    });
  }

  getAnalyseDetail(ctx: TenantContext, analyseId: number): Promise<AnalyseDetail | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [a] = await tx.select().from(analysesPhotosChantier).where(and(eq(analysesPhotosChantier.id, analyseId), eq(analysesPhotosChantier.artisanId, ctx.artisanId))).limit(1);
      if (!a) return null;
      const [photos, resultats, devis] = await Promise.all([
        tx.select().from(photosAnalyse).where(eq(photosAnalyse.analyseId, analyseId)).orderBy(asc(photosAnalyse.ordre)),
        tx.select().from(resultatsAnalyseIA).where(eq(resultatsAnalyseIA.analyseId, analyseId)).orderBy(asc(resultatsAnalyseIA.id)),
        tx.select().from(devisGenereIA).where(eq(devisGenereIA.analyseId, analyseId)).limit(1),
      ]);
      const resultatIds = resultats.map((r) => r.id);
      const suggestions = resultatIds.length ? await tx.select().from(suggestionsArticlesIA).where(inArray(suggestionsArticlesIA.resultatId, resultatIds)).orderBy(asc(suggestionsArticlesIA.id)) : [];
      const byResultat = new Map<number, Suggestion[]>();
      for (const s of suggestions) {
        const arr = byResultat.get(s.resultatId) ?? [];
        arr.push(toSuggestion(s));
        byResultat.set(s.resultatId, arr);
      }
      const resultatsEnrichis: ResultatAvecSuggestions[] = resultats.map((r) => ({ ...toResultat(r), suggestions: byResultat.get(r.id) ?? [] }));
      return { ...toAnalyse(a), photos: photos.map(toPhoto), resultats: resultatsEnrichis, devisGenere: devis[0] ? toDevis(devis[0]) : null };
    });
  }

  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [c] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.artisanId, ctx.artisanId))).limit(1);
      return Boolean(c);
    });
  }

  createAnalyse(ctx: TenantContext, input: CreateAnalyseInput): Promise<Analyse> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx.insert(analysesPhotosChantier).values({ artisanId: ctx.artisanId, clientId: input.clientId ?? null, titre: input.titre ?? null, description: input.description ?? null }).returning();
      return toAnalyse(r);
    });
  }

  addPhoto(ctx: TenantContext, analyseId: number, input: AddPhotoInput): Promise<Photo | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // Ownership de l'analyse parente (RLS + filtre) avant l'insertion de la photo.
      const [a] = await tx.select({ id: analysesPhotosChantier.id }).from(analysesPhotosChantier).where(and(eq(analysesPhotosChantier.id, analyseId), eq(analysesPhotosChantier.artisanId, ctx.artisanId))).limit(1);
      if (!a) return null;
      const [r] = await tx.insert(photosAnalyse).values({ analyseId, url: input.url, description: input.description ?? null, ordre: input.ordre ?? null }).returning();
      return toPhoto(r);
    });
  }

  updateSuggestionOwned(ctx: TenantContext, suggestionId: number, patch: UpdateSuggestionInput): Promise<Suggestion | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // Anti-IDOR : la suggestion doit relever d'une analyse du tenant (jointure suggestion→résultat→analyse,
      // l'analyse étant filtrée RLS+artisanId). Sinon on n'écrit rien.
      const [owned] = await tx
        .select({ id: suggestionsArticlesIA.id })
        .from(suggestionsArticlesIA)
        .innerJoin(resultatsAnalyseIA, eq(resultatsAnalyseIA.id, suggestionsArticlesIA.resultatId))
        .innerJoin(analysesPhotosChantier, eq(analysesPhotosChantier.id, resultatsAnalyseIA.analyseId))
        .where(and(eq(suggestionsArticlesIA.id, suggestionId), eq(analysesPhotosChantier.artisanId, ctx.artisanId)))
        .limit(1);
      if (!owned) return null;
      const set: Record<string, unknown> = {};
      if (patch.selectionne !== undefined) set.selectionne = patch.selectionne;
      if (patch.quantiteSuggeree !== undefined) set.quantiteSuggeree = patch.quantiteSuggeree;
      if (patch.prixEstime !== undefined) set.prixEstime = patch.prixEstime;
      if (Object.keys(set).length > 0) await tx.update(suggestionsArticlesIA).set(set).where(eq(suggestionsArticlesIA.id, suggestionId));
      const [r] = await tx.select().from(suggestionsArticlesIA).where(eq(suggestionsArticlesIA.id, suggestionId)).limit(1);
      return r ? toSuggestion(r) : null;
    });
  }

  createDevisFromAnalyse(ctx: TenantContext, params: { analyseId: number; clientId: number; suggestionIds?: number[] }): Promise<{ devisId: number; montantEstime: number } | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // Ownership de l'analyse (RLS + filtre).
      const [a] = await tx.select().from(analysesPhotosChantier).where(and(eq(analysesPhotosChantier.id, params.analyseId), eq(analysesPhotosChantier.artisanId, ctx.artisanId))).limit(1);
      if (!a) return null;
      // Suggestions de toutes les analyses → résultats → suggestions de CETTE analyse.
      const resultats = await tx.select({ id: resultatsAnalyseIA.id }).from(resultatsAnalyseIA).where(eq(resultatsAnalyseIA.analyseId, params.analyseId));
      const resultatIds = resultats.map((r) => r.id);
      const suggestions = resultatIds.length ? await tx.select().from(suggestionsArticlesIA).where(inArray(suggestionsArticlesIA.resultatId, resultatIds)) : [];
      const devisData = genererLignesDevis(suggestions.map(toSuggestion), params.suggestionIds);
      if (!devisData) return null;

      // Numéro spécial (préfixe IA, parité legacy — distinct du compteur devis standard).
      const numero = `IA-${Date.now().toString().slice(-8)}`;
      const [created] = await tx
        .insert(devis)
        .values({ artisanId: ctx.artisanId, clientId: params.clientId, numero, statut: "brouillon", objet: a.titre || "Devis depuis analyse photos IA", totalHT: devisData.totalHT.toFixed(2), totalTVA: devisData.totalTVA.toFixed(2), totalTTC: devisData.totalTTC.toFixed(2) })
        .returning({ id: devis.id });
      for (const l of devisData.lignes) {
        await tx.insert(devisLignes).values({ devisId: created.id, ordre: l.ordre, designation: l.designation, quantite: l.quantite.toFixed(2), unite: l.unite, prixUnitaireHT: l.prixUnitaireHT.toFixed(2), tauxTVA: l.tauxTVA.toFixed(2), montantHT: l.montantHT.toFixed(2), montantTVA: l.montantTVA.toFixed(2), montantTTC: l.montantTTC.toFixed(2) });
      }
      // Lien analyse→devis (remplace l'existant).
      await tx.delete(devisGenereIA).where(eq(devisGenereIA.analyseId, params.analyseId));
      await tx.insert(devisGenereIA).values({ analyseId: params.analyseId, devisId: created.id, montantEstime: devisData.totalTTC.toFixed(2) });
      return { devisId: created.id, montantEstime: devisData.totalTTC };
    });
  }

  listPhotoUrls(ctx: TenantContext, analyseId: number): Promise<string[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const [a] = await tx.select({ id: analysesPhotosChantier.id }).from(analysesPhotosChantier).where(and(eq(analysesPhotosChantier.id, analyseId), eq(analysesPhotosChantier.artisanId, ctx.artisanId))).limit(1);
      if (!a) return [];
      const rows = await tx.select({ url: photosAnalyse.url }).from(photosAnalyse).where(eq(photosAnalyse.analyseId, analyseId)).orderBy(asc(photosAnalyse.ordre));
      return rows.map((r) => r.url);
    });
  }

  async setStatut(ctx: TenantContext, analyseId: number, statut: "en_cours" | "termine" | "erreur"): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx.update(analysesPhotosChantier).set({ statut }).where(and(eq(analysesPhotosChantier.id, analyseId), eq(analysesPhotosChantier.artisanId, ctx.artisanId)));
    });
  }

  saveResultat(ctx: TenantContext, data: SaveResultatData): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx
        .insert(resultatsAnalyseIA)
        .values({ analyseId: data.analyseId, typeTravauxDetecte: data.typeTravauxDetecte, descriptionTravaux: data.descriptionTravaux, urgence: data.urgence as never, confiance: data.confiance, rawResponse: data.rawResponse })
        .returning({ id: resultatsAnalyseIA.id });
      return r.id;
    });
  }

  async saveSuggestion(ctx: TenantContext, data: SaveSuggestionData): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx.insert(suggestionsArticlesIA).values({ resultatId: data.resultatId, articleId: data.articleId ?? null, nomArticle: data.nomArticle, description: data.description, quantiteSuggeree: data.quantiteSuggeree, unite: data.unite, prixEstime: data.prixEstime, confiance: data.confiance });
    });
  }
}
