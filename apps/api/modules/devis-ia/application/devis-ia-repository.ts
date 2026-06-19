import type { TenantContext } from "../../../shared/tenant";
import type { AddPhotoInput, Analyse, AnalyseDetail, CreateAnalyseInput, Photo, Suggestion, UpdateSuggestionInput } from "../domain/devis-ia";

/*
 * Port du repository devis-IA (slice A : CRUD/lecture). `analyses_photos_chantier` SOUS RLS (artisanId
 * via withTenant) ; tables filles scopées via l'analyse parente (anti-IDOR). Toutes les méthodes qui
 * agissent sur une analyse/suggestion vérifient l'appartenance au tenant (null si hors tenant).
 */
export interface IDevisIARepository {
  listAnalyses(ctx: TenantContext): Promise<Analyse[]>;
  /** Analyse possédée par le tenant (null sinon — anti-IDOR). */
  getAnalyseOwned(ctx: TenantContext, analyseId: number): Promise<Analyse | null>;
  /** Détail enrichi (photos + résultats[+suggestions] + devis généré) — null si hors tenant. */
  getAnalyseDetail(ctx: TenantContext, analyseId: number): Promise<AnalyseDetail | null>;
  /** Le client référencé appartient-il au tenant ? (anti-IDOR-FK à la création). */
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;
  createAnalyse(ctx: TenantContext, input: CreateAnalyseInput): Promise<Analyse>;
  /** Ajoute une photo à une analyse possédée — null si l'analyse n'est pas au tenant. */
  addPhoto(ctx: TenantContext, analyseId: number, input: AddPhotoInput): Promise<Photo | null>;
  /*
   * Met à jour une suggestion SI son analyse parente appartient au tenant (anti-IDOR via la chaîne
   * suggestion→résultat→analyse). null si hors tenant. ⚠️ Corrige l'IDOR latent du legacy (aucune garde).
   */
  updateSuggestionOwned(ctx: TenantContext, suggestionId: number, patch: UpdateSuggestionInput): Promise<Suggestion | null>;

  /*
   * Crée un devis (brouillon) à partir des suggestions SÉLECTIONNÉES d'une analyse possédée + lie
   * analyse→devis. Renvoie null si l'analyse n'est pas au tenant OU si aucune suggestion sélectionnée.
   */
  createDevisFromAnalyse(ctx: TenantContext, params: { analyseId: number; clientId: number; suggestionIds?: number[] }): Promise<{ devisId: number; montantEstime: number } | null>;

  /*
   * ── analyserPhotos (Vision) ──
   * URLs des photos d'une analyse possédée (pour l'appel Vision). [] si analyse hors tenant.
   */
  listPhotoUrls(ctx: TenantContext, analyseId: number): Promise<string[]>;
  /** Met à jour le statut de l'analyse (possédée). */
  setStatut(ctx: TenantContext, analyseId: number, statut: "en_cours" | "termine" | "erreur"): Promise<void>;
  /** Enregistre un résultat d'analyse → renvoie son id (pour rattacher les suggestions). */
  saveResultat(ctx: TenantContext, data: SaveResultatData): Promise<number>;
  /** Enregistre une suggestion d'article rattachée à un résultat. */
  saveSuggestion(ctx: TenantContext, data: SaveSuggestionData): Promise<void>;
}

export interface SaveResultatData {
  readonly analyseId: number;
  readonly typeTravauxDetecte: string;
  readonly descriptionTravaux: string;
  readonly urgence: string;
  readonly confiance: string;
  readonly rawResponse: unknown;
}

export interface SaveSuggestionData {
  readonly resultatId: number;
  readonly articleId: number | null;
  readonly nomArticle: string;
  readonly description: string;
  readonly quantiteSuggeree: string;
  readonly unite: string;
  readonly prixEstime: string;
  readonly confiance: string;
}
