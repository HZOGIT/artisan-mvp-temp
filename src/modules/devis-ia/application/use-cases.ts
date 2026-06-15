import { NotFoundError, TooManyRequestsError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { VisionPort } from "../../../shared/ports/vision";
import type { ArtisanReader } from "../../../shared/readers/contact-readers";
import type { IDevisIARepository } from "./devis-ia-repository";
import type { AddPhotoInput, Analyse, AnalyseDetail, CreateAnalyseInput, Photo, Suggestion, UpdateSuggestionInput } from "../domain/devis-ia";
import { buildImageBlocks, buildSystemPrompt, parseAnalyseResponse, sanitizeVisionError, matchBibliotheque } from "../domain/analyse-photos";

export function listAnalyses(repo: IDevisIARepository, ctx: TenantContext): Promise<Analyse[]> {
  return repo.listAnalyses(ctx);
}

// Détail d'une analyse possédée (404 anti-IDOR si hors tenant).
export async function getAnalyse(repo: IDevisIARepository, ctx: TenantContext, analyseId: number): Promise<AnalyseDetail> {
  const detail = await repo.getAnalyseDetail(ctx, analyseId);
  if (!detail) throw new NotFoundError("Analyse non trouvée");
  return detail;
}

// Crée une analyse ; si un client est rattaché, valide son appartenance au tenant (anti-IDOR-FK).
export async function createAnalyse(repo: IDevisIARepository, ctx: TenantContext, input: CreateAnalyseInput): Promise<Analyse> {
  if (input.clientId != null && !(await repo.ownsClient(ctx, input.clientId))) {
    throw new NotFoundError("Client introuvable");
  }
  return repo.createAnalyse(ctx, input);
}

// Ajoute une photo à une analyse possédée (404 anti-IDOR).
export async function addPhoto(repo: IDevisIARepository, ctx: TenantContext, analyseId: number, input: AddPhotoInput): Promise<Photo> {
  const photo = await repo.addPhoto(ctx, analyseId, input);
  if (!photo) throw new NotFoundError("Analyse non trouvée");
  return photo;
}

// Met à jour une suggestion (404 si elle ne relève pas d'une analyse du tenant). ⚠️ Comble l'IDOR
// du legacy (qui mettait à jour par id sans vérifier l'appartenance).
export async function updateSuggestion(repo: IDevisIARepository, ctx: TenantContext, suggestionId: number, patch: UpdateSuggestionInput): Promise<Suggestion> {
  const updated = await repo.updateSuggestionOwned(ctx, suggestionId, patch);
  if (!updated) throw new NotFoundError("Suggestion introuvable");
  return updated;
}

// Génère un devis (brouillon) depuis les suggestions sélectionnées d'une analyse possédée. Valide
// l'analyse (404) ET le client rattaché (404 anti-IDOR-FK — sinon fuite PII via relecture du devis).
// null si aucune suggestion sélectionnée (parité legacy).
export async function genererDevis(repo: IDevisIARepository, ctx: TenantContext, params: { analyseId: number; clientId: number; suggestionIds?: number[] }): Promise<{ devisId: number; montantEstime: number } | null> {
  if (!(await repo.getAnalyseOwned(ctx, params.analyseId))) throw new NotFoundError("Analyse non trouvée");
  if (!(await repo.ownsClient(ctx, params.clientId))) throw new NotFoundError("Client introuvable");
  return repo.createDevisFromAnalyse(ctx, params);
}

export interface AnalyserPhotosDeps {
  readonly repo: IDevisIARepository;
  readonly vision: VisionPort;
  readonly rateLimiter: { check(key: string): Promise<boolean> };
  readonly artisanReader: ArtisanReader;
  readonly bibliotheque: { list(filtre?: unknown): Promise<Array<{ id: number; nom: string }>> };
}

// Analyse les photos d'une analyse via l'IA Vision (parité legacy `analyserPhotos`). Ownership (404),
// rate-limit IA (429). Statut `en_cours` → appel Vision multi-image (prompt métier) → parse JSON →
// enregistre résultats + suggestions (match bibliothèque) → statut `termine`. Sur échec Vision/parse :
// statut `erreur` + Error 500 (message sanitisé, sans payload base64). 400 si aucune photo.
export async function analyserPhotos(deps: AnalyserPhotosDeps, ctx: TenantContext, analyseId: number): Promise<{ success: true; nombreTravaux: number }> {
  if (!(await deps.repo.getAnalyseOwned(ctx, analyseId))) throw new NotFoundError("Analyse non trouvée");
  if (!(await deps.rateLimiter.check(`ia:${ctx.artisanId}`))) throw new TooManyRequestsError("Limite atteinte");

  await deps.repo.setStatut(ctx, analyseId, "en_cours");

  const urls = await deps.repo.listPhotoUrls(ctx, analyseId);
  if (urls.length === 0) {
    await deps.repo.setStatut(ctx, analyseId, "erreur");
    throw new ValidationError("Aucune photo à analyser");
  }

  const artisan = await deps.artisanReader.getArtisan(ctx);
  const metier = (artisan?.metier as string | null | undefined) || (artisan?.specialite as string | null | undefined) || null;
  const system = buildSystemPrompt(metier);

  let responseText: string;
  try {
    responseText = await deps.vision.analyzeImages({ images: buildImageBlocks(urls), prompt: "Analyse ces photos de chantier et identifie les travaux nécessaires.", system, maxOutputTokens: 4000 });
  } catch (e) {
    await deps.repo.setStatut(ctx, analyseId, "erreur");
    throw new Error(`Appel IA echoue : ${sanitizeVisionError(e)}`);
  }

  const travaux = parseAnalyseResponse(responseText);
  if (!travaux) {
    await deps.repo.setStatut(ctx, analyseId, "erreur");
    throw new Error("Reponse IA non parsable ou format inattendu (champ 'travaux' absent)");
  }

  const catalogue = await deps.bibliotheque.list();
  for (const travail of travaux) {
    const resultatId = await deps.repo.saveResultat(ctx, {
      analyseId,
      typeTravauxDetecte: String(travail.type ?? ""),
      descriptionTravaux: String(travail.description ?? ""),
      urgence: String(travail.urgence ?? "moyenne"),
      confiance: String(travail.confiance ?? "0"),
      rawResponse: travail,
    });
    for (const article of travail.articles ?? []) {
      await deps.repo.saveSuggestion(ctx, {
        resultatId,
        articleId: matchBibliotheque(catalogue, article.nom),
        nomArticle: String(article.nom ?? ""),
        description: String(article.description ?? ""),
        quantiteSuggeree: String(article.quantite ?? "1"),
        unite: String(article.unite ?? "unité"),
        prixEstime: String(article.prixEstime ?? "0"),
        confiance: String(travail.confiance ?? "0"),
      });
    }
  }

  await deps.repo.setStatut(ctx, analyseId, "termine");
  return { success: true, nombreTravaux: travaux.length };
}
