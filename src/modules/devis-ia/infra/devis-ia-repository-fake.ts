import type { TenantContext } from "../../../shared/tenant";
import type { IDevisIARepository } from "../application/devis-ia-repository";
import type { AddPhotoInput, Analyse, AnalyseDetail, CreateAnalyseInput, Photo, ResultatAvecSuggestions, Suggestion, DevisGenere, UpdateSuggestionInput } from "../domain/devis-ia";

interface StoredAnalyse extends Analyse {
  readonly artisanId: number;
}
interface StoredSuggestion extends Suggestion {
  readonly artisanId: number; // tenant propriétaire (via l'analyse parente) — pour l'anti-IDOR du fake
}

export interface DevisIAFakeState {
  analyses?: StoredAnalyse[];
  photos?: Photo[];
  resultats?: ResultatAvecSuggestions[];
  devisGenere?: Record<number, DevisGenere>;
  suggestions?: StoredSuggestion[];
  ownedClientIds?: number[];
}

// Fake en mémoire du repository devis-IA (scope tenant simulé par `artisanId` sur analyses/suggestions).
export class DevisIARepositoryFake implements IDevisIARepository {
  analyses: StoredAnalyse[];
  photos: Photo[];
  private resultats: ResultatAvecSuggestions[];
  private devisGenere: Record<number, DevisGenere>;
  suggestions: StoredSuggestion[];
  private ownedClientIds: Set<number>;
  private seq = 1000;

  constructor(state: DevisIAFakeState = {}) {
    this.analyses = state.analyses ?? [];
    this.photos = state.photos ?? [];
    this.resultats = state.resultats ?? [];
    this.devisGenere = state.devisGenere ?? {};
    this.suggestions = state.suggestions ?? [];
    this.ownedClientIds = new Set(state.ownedClientIds ?? []);
  }

  async listAnalyses(ctx: TenantContext): Promise<Analyse[]> {
    return this.analyses.filter((a) => a.artisanId === ctx.artisanId).map(({ artisanId: _a, ...rest }) => rest);
  }
  async getAnalyseOwned(ctx: TenantContext, analyseId: number): Promise<Analyse | null> {
    const a = this.analyses.find((x) => x.id === analyseId && x.artisanId === ctx.artisanId);
    if (!a) return null;
    const { artisanId: _a, ...rest } = a;
    return rest;
  }
  async getAnalyseDetail(ctx: TenantContext, analyseId: number): Promise<AnalyseDetail | null> {
    const a = await this.getAnalyseOwned(ctx, analyseId);
    if (!a) return null;
    return { ...a, photos: this.photos.filter((p) => p.analyseId === analyseId), resultats: this.resultats.filter((r) => r.analyseId === analyseId), devisGenere: this.devisGenere[analyseId] ?? null };
  }
  async ownsClient(_ctx: TenantContext, clientId: number): Promise<boolean> {
    return this.ownedClientIds.has(clientId);
  }
  async createAnalyse(ctx: TenantContext, input: CreateAnalyseInput): Promise<Analyse> {
    const a: StoredAnalyse = { id: this.seq++, artisanId: ctx.artisanId, clientId: input.clientId ?? null, titre: input.titre ?? null, description: input.description ?? null, statut: "en_attente", createdAt: new Date(), updatedAt: new Date() };
    this.analyses.push(a);
    const { artisanId: _a, ...rest } = a;
    return rest;
  }
  async addPhoto(ctx: TenantContext, analyseId: number, input: AddPhotoInput): Promise<Photo | null> {
    if (!(await this.getAnalyseOwned(ctx, analyseId))) return null;
    const p: Photo = { id: this.seq++, analyseId, url: input.url, description: input.description ?? null, ordre: input.ordre ?? null, uploadedAt: new Date() };
    this.photos.push(p);
    return p;
  }
  async updateSuggestionOwned(ctx: TenantContext, suggestionId: number, patch: UpdateSuggestionInput): Promise<Suggestion | null> {
    const i = this.suggestions.findIndex((s) => s.id === suggestionId && s.artisanId === ctx.artisanId);
    if (i < 0) return null;
    this.suggestions[i] = { ...this.suggestions[i], ...(patch.selectionne !== undefined ? { selectionne: patch.selectionne } : {}), ...(patch.quantiteSuggeree !== undefined ? { quantiteSuggeree: patch.quantiteSuggeree } : {}), ...(patch.prixEstime !== undefined ? { prixEstime: patch.prixEstime } : {}) };
    const { artisanId: _a, ...rest } = this.suggestions[i];
    return rest;
  }
}
