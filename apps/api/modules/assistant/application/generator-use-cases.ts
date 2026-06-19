import { NotFoundError, TooManyRequestsError } from "../../../shared/errors";
import type { LlmPort } from "../../../shared/ports/llm";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader } from "../../../shared/readers/contact-readers";
import type { TenantContext } from "../../../shared/tenant";
import {
  buildSuggestRelancesPrompt,
  parseRelances,
  buildGenerateDevisPrompt,
  parseDevisLignes,
  buildAnalyseRentabilitePrompt,
  buildPredictionTresoreriePrompt,
  joursDepuis,
  type RelanceItem,
} from "../domain/generators";
import type { AssistantDataReader } from "./assistant-data-reader";

/*
 * Dépendances des générateurs IA de l'assistant (lecture seule, NON persistée). Rate-limit IA partagé
 * (30/h par artisan, parité legacy `checkRateLimit`).
 */
export interface AssistantGeneratorDeps {
  readonly llm: LlmPort;
  readonly rateLimiter: RateLimiterPort;
  readonly artisanReader: ArtisanReader;
  readonly dataReader: AssistantDataReader;
  readonly maintenant?: () => Date;
}

const RELANCE_SEUIL_JOURS = 7;

async function rateLimitKO(deps: AssistantGeneratorDeps, ctx: TenantContext): Promise<boolean> {
  return !(await deps.rateLimiter.check(`ia:${ctx.artisanId}`));
}

async function complete(deps: AssistantGeneratorDeps, parts: { system: string; user: string; temperature: number; maxOutputTokens: number }): Promise<string> {
  return deps.llm.complete(parts.user, { system: parts.system, temperature: parts.temperature, maxOutputTokens: parts.maxOutputTokens });
}

/*
 * `assistant.suggestRelances` (parité legacy) : pas d'artisan → [] ; rate-limit → **429** ; aucun
 * devis à relancer (>7 j) → [] ; sinon emails de relance générés (JSON, `[{error}]` si non parsable).
 */
export async function suggestRelances(deps: AssistantGeneratorDeps, ctx: TenantContext): Promise<unknown[]> {
  const artisan = await deps.artisanReader.getArtisan(ctx);
  if (!artisan) return [];
  if (await rateLimitKO(deps, ctx)) throw new TooManyRequestsError("Limite atteinte");

  const now = (deps.maintenant ?? (() => new Date()))();
  const devis = await deps.dataReader.listDevisNonSignes(ctx);
  const items: RelanceItem[] = devis
    .map((d) => ({ numero: d.numero, objet: d.objet, totalTTC: d.totalTTC, jours: joursDepuis(d.dateDevis, now), client: d.clientNom }))
    .filter((d) => d.jours >= RELANCE_SEUIL_JOURS);
  if (items.length === 0) return [];

  const text = await complete(deps, buildSuggestRelancesPrompt(items));
  return parseRelances(text);
}

/*
 * `assistant.generateDevis` (parité legacy) : pas d'artisan → **404** ; rate-limit → **429** ; renvoie
 * `{lignes, raw}` (lignes = [] si JSON non parsable).
 */
export async function generateDevis(
  deps: AssistantGeneratorDeps,
  ctx: TenantContext,
  input: { description: string },
): Promise<{ lignes: unknown[]; raw: string }> {
  const artisan = await deps.artisanReader.getArtisan(ctx);
  if (!artisan) throw new NotFoundError("Artisan non trouvé");
  if (await rateLimitKO(deps, ctx)) throw new TooManyRequestsError("Limite atteinte");

  const catalogue = await deps.dataReader.getCatalogue(ctx);
  const raw = await complete(deps, buildGenerateDevisPrompt(input.description, catalogue));
  return { lignes: parseDevisLignes(raw), raw };
}

/*
 * `assistant.analyseRentabilite` (parité legacy) : pas d'artisan → **404** ; rate-limit → **429** ;
 * devis hors tenant/inexistant → **404** (anti-IDOR) ; renvoie `{analyse: markdown}`.
 */
export async function analyseRentabilite(
  deps: AssistantGeneratorDeps,
  ctx: TenantContext,
  input: { devisId: number },
): Promise<{ analyse: string }> {
  const artisan = await deps.artisanReader.getArtisan(ctx);
  if (!artisan) throw new NotFoundError("Artisan non trouvé");
  if (await rateLimitKO(deps, ctx)) throw new TooManyRequestsError("Limite atteinte");

  const data = await deps.dataReader.getDevisAnalyse(ctx, input.devisId);
  if (!data) throw new NotFoundError("Devis non trouvé");

  const analyse = await complete(deps, buildAnalyseRentabilitePrompt(data));
  return { analyse };
}

/*
 * `assistant.predictionTresorerie` (parité legacy) : pas d'artisan → **404** ; rate-limit → **429** ;
 * renvoie `{prediction: markdown}`.
 */
export async function predictionTresorerie(deps: AssistantGeneratorDeps, ctx: TenantContext): Promise<{ prediction: string }> {
  const artisan = await deps.artisanReader.getArtisan(ctx);
  if (!artisan) throw new NotFoundError("Artisan non trouvé");
  if (await rateLimitKO(deps, ctx)) throw new TooManyRequestsError("Limite atteinte");

  const data = await deps.dataReader.getTresorerie(ctx);
  const prediction = await complete(deps, buildPredictionTresoreriePrompt(data));
  return { prediction };
}
