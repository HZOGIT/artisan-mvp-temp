import { TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { LlmPort } from "../../../shared/ports/llm";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import { sanitizeIaError } from "../../../shared/ia/sanitize-ia-error";

/** Dépendances de la génération IA de lignes de devis (lecture seule, non persistée). */
export interface DevisIaDeps {
  readonly llm: LlmPort;
  readonly rateLimiter: RateLimiterPort;
}

export interface GenererLignesIaInput {
  readonly description: string;
  readonly surface?: number;
  readonly budget?: number;
}

/** Ligne de devis PROPOSÉE par l'IA (non persistée — le client la met dans le formulaire). */
export interface LigneDevisIa {
  readonly designation: string;
  readonly quantite: number;
  readonly unite: string;
  readonly prixUnitaire: number;
  readonly tauxTva: number;
  readonly type: string;
}

export interface PropositionDevisIa {
  readonly objet: string;
  readonly dureeEstimee: string | null;
  readonly lignes: LigneDevisIa[];
  readonly notes: string | null;
  readonly conseilsArtisan: string | null;
}

const SYSTEM =
  "Tu es un assistant pour artisans du bâtiment en France. Tu génères les lignes détaillées d'un devis professionnel (main d'œuvre ET fournitures, prix réalistes marché français). Tu réponds UNIQUEMENT en JSON pur (pas de markdown).";

function toLigne(l: Record<string, unknown>): LigneDevisIa {
  return {
    designation: String(l.designation ?? "").slice(0, 500),
    quantite: Number(l.quantite) || 1,
    unite: String(l.unite ?? "u").slice(0, 20),
    prixUnitaire: Number(l.prixUnitaire) || 0,
    tauxTva: Number(l.tauxTva) || 0,
    type: String(l.type ?? "fourniture").slice(0, 30),
  };
}

/*
 * Génère des lignes de devis à partir d'une description de chantier (parité legacy
 * `devis.genererLignesIA`). ⚠️ **Lecture seule, RIEN n'est persisté.** Invariants : rate-limit IA
 * (429) ; parse JSON **défensif** (proposition vide si non parsable) ; erreurs IA assainies (pas de
 * fuite de clé). Renvoie `{objet, dureeEstimee, lignes, notes, conseilsArtisan}`.
 */
export async function genererLignesDevisIA(
  deps: DevisIaDeps,
  ctx: TenantContext,
  input: GenererLignesIaInput,
): Promise<PropositionDevisIa> {
  if (!(await deps.rateLimiter.check(`ia:${ctx.artisanId}`))) {
    throw new TooManyRequestsError("Limite IA atteinte. Réessayez dans un moment.");
  }

  const objetParDefaut = input.description.slice(0, 80);
  const userPrompt = `Chantier décrit : "${input.description}"
${input.surface ? `Surface : ${input.surface} m²` : ""}
${input.budget ? `Budget client : ${input.budget} €` : ""}

Génère les lignes détaillées d'un devis professionnel. Inclure main d'œuvre ET fournitures. Prix réalistes marché français.

Réponds UNIQUEMENT en JSON pur :
{"objet":"objet court","dureeEstimee":"X jours","lignes":[{"designation":"description","quantite":1,"unite":"u|m|m2|h|forfait","prixUnitaire":0,"tauxTva":10,"type":"fourniture|main_oeuvre|forfait"}],"notes":"remarques","conseilsArtisan":"conseils"}`;

  let text: string;
  try {
    text = await deps.llm.complete(userPrompt, { system: SYSTEM, temperature: 0.3, maxOutputTokens: 2500 });
  } catch (e) {
    throw new Error(`Génération IA échouée : ${sanitizeIaError(e)}`);
  }

  const empty: PropositionDevisIa = { objet: objetParDefaut, dureeEstimee: null, lignes: [], notes: null, conseilsArtisan: null };
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return empty;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(jsonMatch[0]);
  } catch {
    return empty;
  }

  return {
    objet: typeof data.objet === "string" && data.objet ? data.objet.slice(0, 500) : objetParDefaut,
    dureeEstimee: typeof data.dureeEstimee === "string" ? data.dureeEstimee.slice(0, 100) : null,
    lignes: Array.isArray(data.lignes) ? (data.lignes as Array<Record<string, unknown>>).map(toLigne) : [],
    notes: typeof data.notes === "string" ? data.notes.slice(0, 1000) : null,
    conseilsArtisan: typeof data.conseilsArtisan === "string" ? data.conseilsArtisan.slice(0, 1000) : null,
  };
}
