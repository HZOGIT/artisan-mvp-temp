import type { TenantContext } from "../../../shared/tenant";
import type { LlmPort } from "../../../shared/ports/llm";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader } from "../../../shared/readers/contact-readers";
import type { AppLogger } from "../../../shared/ports/logger";
import { getContexteMetier } from "../../../shared/ia/contexte-metier";
import { sanitizeIaError } from "../../../shared/ia/sanitize-ia-error";
import type { ConseilsResult, ConseilsStats } from "../domain/conseils";
import { CONSEILS_VIDE, buildConseilsPrompt, parseConseils } from "../domain/conseils";
import type { ConseilsStatsReader } from "./conseils-stats-reader";

/** Dépendances des conseils IA (lecture seule, non persistée). Parité legacy `conseilsIA`. */
export interface ConseilsIaDeps {
  readonly llm: LlmPort;
  readonly rateLimiter: RateLimiterPort;
  readonly artisanReader: ArtisanReader;
  readonly statsReader: ConseilsStatsReader;
  readonly maintenant?: () => Date;
}

const STATS_VIDE: ConseilsStats = { nbDevisEnAttente: 0, nbFacturesImpayees: 0, montantImpayees: 0, nbStocksBas: 0 };

/*
 * `conseilsIA` (parité legacy) : 3 conseils personnalisés via l'IA, à partir de stats minimales du
 * tenant. ⚠️ **Dégradation SILENCIEUSE STRICTE** (parité legacy) : pas d'artisan, rate-limit atteint,
 * stats indisponibles, erreur provider ou JSON non parsable ⇒ `{conseils: []}`. Jamais d'exception.
 */
export async function getConseilsIA(deps: ConseilsIaDeps, ctx: TenantContext, log?: AppLogger): Promise<ConseilsResult> {
  const artisan = await deps.artisanReader.getArtisan(ctx);
  if (!artisan) return CONSEILS_VIDE;

  /** Rate-limit IA (anti-coût). Parité legacy : pas de 429, on renvoie {conseils: []}. */
  if (!(await deps.rateLimiter.check(`ia:${ctx.artisanId}`))) return CONSEILS_VIDE;

  const metier = (artisan.metier as string | null | undefined) || (artisan.specialite as string | null | undefined) || null;

  /** Stats best-effort : un échec ne doit pas casser les conseils (prompt avec des zéros). */
  let stats = STATS_VIDE;
  try {
    stats = await deps.statsReader.getStats(ctx);
  } catch {
    /* best-effort : zéros */
  }

  const now = (deps.maintenant ?? (() => new Date()))();
  const moisLabel = now.toLocaleDateString("fr-FR", { month: "long" });
  const prompt = buildConseilsPrompt({ nomEntreprise: artisan.nomEntreprise, metier, stats, moisLabel });

  const t0 = Date.now();
  try {
    const { text } = await deps.llm.complete(prompt, {
      system: getContexteMetier(metier),
      temperature: 0.6,
      maxOutputTokens: 800,
    });
    const llmDuration = Date.now() - t0;
    const conseils = parseConseils(text);
    log?.info({ event: "llm_complete", useCase: "conseilsIA", llmDuration, conseils: conseils.length }, `LLM conseilsIA terminé en ${llmDuration}ms`);
    if (conseils.length === 0) return CONSEILS_VIDE;
    return { conseils, genereLe: now.toISOString() };
  } catch (e) {
    const llmDuration = Date.now() - t0;
    log?.warn({ event: "conseils_ia_llm_error", llmDuration, error: sanitizeIaError(e) }, "Erreur LLM conseilsIA — retour vide");
    return CONSEILS_VIDE;
  }
}
