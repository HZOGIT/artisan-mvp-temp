import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { LlmPort } from "../../../shared/ports/llm";
import type { LlmUsageTracker } from "../../../shared/ports/llm-usage-tracker";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { IDevisRepository } from "../../devis/application/devis-repository";
import type { IStockRepository } from "../../stocks/application/stock-repository";
import type { IArticleRepository } from "../../articles/application/article-repository";
import { sanitizeIaError } from "../../../shared/ia/sanitize-ia-error";
/** Réexport (compat appelants/test existants) — l'implémentation vit désormais dans shared/ia. */
export { sanitizeIaError };

/** Dépendances de la génération IA d'une commande à partir d'un devis (lecture seule, non persistée). */
export interface CommandeIaDeps {
  readonly devisRepo: IDevisRepository;
  readonly stockRepo: IStockRepository;
  readonly articleRepo: IArticleRepository;
  readonly llm: LlmPort;
  readonly trackLlm?: LlmUsageTracker;
  readonly rateLimiter: RateLimiterPort;
}

/** Ligne de commande PROPOSÉE par l'IA (non persistée — le client l'ajoute au formulaire). */
export interface LigneProposee {
  readonly articleId: number | null;
  readonly designation: string;
  readonly reference: string;
  readonly quantite: number;
  readonly unite: string;
  readonly prixUnitaire: number;
  readonly tauxTVA: number;
}

export interface PropositionCommande {
  readonly lignes: LigneProposee[];
  readonly notes: string;
  readonly devisNumero: string;
}

function rateLimitKey(artisanId: number): string {
  return `ia:${artisanId}`;
}

const norm = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const SYSTEM = "Tu es un assistant pour artisans du bâtiment en France. Tu déduis des matériaux/fournitures à commander à partir des lignes d'un devis. Tu réponds UNIQUEMENT en JSON pur (pas de markdown).";

/*
 * Propose les lignes de commande fournisseur déduites d'un devis accepté, via l'IA (parité legacy
 * `commandesFournisseurs.genererDepuisDevisIA`). ⚠️ Lecture seule — RIEN n'est persisté. Invariants :
 *  - rate-limit IA AVANT tout (anti-coût, 429) ;
 *  - devis du tenant (404) et **statut `accepte`** (400) ;
 *  - exclut la main d'œuvre, ajuste selon le stock, matche `articleId` sur les articles artisan ;
 *  - parse défensif du JSON (sinon proposition vide) ; erreurs IA assainies (pas de fuite).
 */
export async function genererCommandeDepuisDevisIA(
  deps: CommandeIaDeps,
  ctx: TenantContext,
  devisId: number,
): Promise<PropositionCommande> {
  if (!(await deps.rateLimiter.check(rateLimitKey(ctx.artisanId)))) {
    throw new TooManyRequestsError("Limite IA atteinte. Réessayez dans un moment.");
  }

  const devis = await deps.devisRepo.getById(ctx, devisId);
  if (!devis) throw new NotFoundError("Devis introuvable");
  if (devis.statut !== "accepte") throw new ValidationError("Le devis doit être accepté");

  const lignesDevis = await deps.devisRepo.listLignes(ctx, devisId);
  if (lignesDevis.length === 0) return { lignes: [], notes: "Devis sans ligne.", devisNumero: devis.numero };

  /** Lectures best-effort (le stock/les articles ne sont qu'une aide à la proposition). */
  let stocks: Awaited<ReturnType<IStockRepository["list"]>> = [];
  try {
    stocks = await deps.stockRepo.list(ctx);
  } catch {
    /* ok */
  }
  let articles: Awaited<ReturnType<IArticleRepository["list"]>> = [];
  try {
    articles = await deps.articleRepo.list(ctx);
  } catch {
    /* ok */
  }

  const lignesPourPrompt = lignesDevis.map((l) => ({
    designation: l.designation,
    quantite: Number(l.quantite || 1),
    unite: l.unite || "u",
    prix: Number(l.prixUnitaireHT || 0),
  }));
  const stockPourPrompt = stocks.map((s) => ({ designation: s.designation, enStock: Number(s.quantiteEnStock || 0) }));

  const userPrompt = `Devis "${devis.objet || devis.numero}" — lignes :
${JSON.stringify(lignesPourPrompt, null, 2)}

Stock actuel disponible (peut être vide) :
${JSON.stringify(stockPourPrompt, null, 2)}

Tâche : à partir des lignes du devis, déduis la liste des MATÉRIAUX et FOURNITURES à commander au fournisseur. Exclus strictement la main d'œuvre et les forfaits intellectuels. Pour chaque fourniture, propose une quantité adaptée aux quantités du devis et au stock disponible. Si une fourniture est déjà en stock en quantité suffisante, retire-la ou réduis la quantité à 0. Estime le prixUnitaire HT marché français.

Réponds UNIQUEMENT en JSON pur :
{"lignes":[{"designation":"texte","reference":"","quantite":1,"unite":"u|m|m2|kg|ml","prixUnitaire":0,"tauxTVA":20}],"notes":"remarques optionnelles"}`;

  let text: string;
  try {
    const result = await deps.llm.complete(userPrompt, { system: SYSTEM, temperature: 0.3, maxOutputTokens: 2500 });
    text = result.text;
    deps.trackLlm?.({ artisanId: ctx.artisanId, userId: ctx.userId, useCase: "commande_depuis_devis_ia", usage: result.usage });
  } catch (e) {
    throw new Error(`Génération IA échouée : ${sanitizeIaError(e)}`);
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { lignes: [], notes: "", devisNumero: devis.numero };
  let data: { lignes?: unknown; notes?: unknown };
  try {
    data = JSON.parse(jsonMatch[0]);
  } catch {
    return { lignes: [], notes: "", devisNumero: devis.numero };
  }

  const rawLignes = Array.isArray(data.lignes) ? (data.lignes as Array<Record<string, unknown>>) : [];
  const lignes: LigneProposee[] = rawLignes
    .filter((l) => Number(l.quantite) > 0)
    .map((l) => {
      const dnorm = norm(l.designation);
      const match =
        articles.find((a) => norm(a.designation) === dnorm) ??
        articles.find((a) => norm(a.designation).includes(dnorm) || dnorm.includes(norm(a.designation)));
      return {
        articleId: match ? match.id : null,
        designation: String(l.designation ?? "").slice(0, 500),
        reference: match?.reference || String(l.reference ?? ""),
        quantite: Math.max(0.01, Number(l.quantite) || 1),
        unite: String(l.unite ?? "u").slice(0, 20),
        prixUnitaire: Number(l.prixUnitaire) || 0,
        tauxTVA: Number(l.tauxTVA) || 20,
      };
    });

  return {
    lignes,
    notes: typeof data.notes === "string" ? data.notes.slice(0, 500) : "",
    devisNumero: devis.numero,
  };
}
