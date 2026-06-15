import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { analysesPhotosChantier, photosAnalyse, resultatsAnalyseIA, suggestionsArticlesIA, devisGenereIA, clients } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisIARepository } from "../application/devis-ia-repository";
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
}
