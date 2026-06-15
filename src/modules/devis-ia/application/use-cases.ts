import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisIARepository } from "./devis-ia-repository";
import type { AddPhotoInput, Analyse, AnalyseDetail, CreateAnalyseInput, Photo, Suggestion, UpdateSuggestionInput } from "../domain/devis-ia";

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
