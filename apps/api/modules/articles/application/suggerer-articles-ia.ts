import type { TenantContext } from "../../../shared/tenant";
import type { LlmPort } from "../../../shared/ports/llm";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader } from "../../../shared/readers/contact-readers";
import { getContexteMetier } from "../../../shared/ia/contexte-metier";
import { sanitizeIaError } from "../../../shared/ia/sanitize-ia-error";

/*
 * Dépendances de la suggestion IA d'articles (lecture seule, NON persistée — le client ajoute la
 * proposition au formulaire). Parité legacy `articles.suggererArticlesIA`.
 */
export interface ArticlesIaDeps {
  readonly llm: LlmPort;
  readonly rateLimiter: RateLimiterPort;
  readonly artisanReader: ArtisanReader;
}

/*
 * Article PROPOSÉ par l'IA (catalogue suggéré quand l'artisan cherche une prestation absente de sa
 * bibliothèque). Champs coercés défensivement (sortie LLM non fiable).
 */
export interface ArticleSuggere {
  readonly designation: string;
  readonly reference: string;
  readonly unite: string;
  readonly prixUnitaire: number;
  readonly description: string;
  readonly categorie: string;
}

export interface SuggererArticlesInput {
  readonly query: string;
  readonly contexte?: string;
}

function rateLimitKey(artisanId: number): string {
  return `ia:${artisanId}`;
}

/*
 * Propose ~5 articles réalistes (prix marché FR) adaptés au métier de l'artisan, via l'IA.
 * ⚠️ Parité legacy STRICTE : **aucune exception** — rate-limit atteint, erreur provider ou JSON non
 * parsable ⇒ renvoie `[]` (dégradation silencieuse). Aucune persistance.
 */
export async function suggererArticlesIA(
  deps: ArticlesIaDeps,
  ctx: TenantContext,
  input: SuggererArticlesInput,
): Promise<ArticleSuggere[]> {
  // Rate-limit IA AVANT tout (anti-coût). Parité legacy : pas de 429, on renvoie [].
  if (!(await deps.rateLimiter.check(rateLimitKey(ctx.artisanId)))) return [];

  const artisan = await deps.artisanReader.getArtisan(ctx);
  const metier = (artisan?.metier as string | null | undefined) || (artisan?.specialite as string | null | undefined) || null;
  const contexteMetier = getContexteMetier(metier);

  const userPrompt = `L'artisan cherche : "${input.query}"
Contexte : ${input.contexte || "creation de devis"}.

Propose 5 articles pertinents pour un artisan ${metier || "du bâtiment"} en France avec prix realistes marche 2024.

Reponds UNIQUEMENT en JSON pur (pas de markdown, pas de texte autour) :
{"articles":[{"designation":"nom","reference":"REF-XXX","unite":"u|m|m²|ml|kg|L|h","prixUnitaire":0,"description":"courte","categorie":"cat"}]}`;

  let text: string;
  try {
    text = await deps.llm.complete(userPrompt, { system: contexteMetier, temperature: 0.4, maxOutputTokens: 1000 });
  } catch (e) {
    console.warn("[suggererArticlesIA]", sanitizeIaError(e));
    return [];
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  let data: { articles?: unknown };
  try {
    data = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
  const raw = Array.isArray(data.articles) ? (data.articles as Array<Record<string, unknown>>) : [];
  return raw
    .filter((a) => a && typeof a === "object")
    .map((a) => ({
      designation: String(a.designation ?? "").slice(0, 500),
      reference: String(a.reference ?? "").slice(0, 50),
      unite: String(a.unite ?? "u").slice(0, 20),
      prixUnitaire: Number(a.prixUnitaire) || 0,
      description: String(a.description ?? "").slice(0, 2000),
      categorie: String(a.categorie ?? "").slice(0, 100),
    }));
}
