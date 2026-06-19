import type { VisionImage } from "../../../shared/ports/vision";
import { getContexteMetier } from "../../../shared/ia/contexte-metier";

/*
 * Prompts spécialisés par métier (parité legacy `PROMPTS_METIER`) : l'IA devient un expert du métier
 * de l'artisan → quantités/prix/marques plus réalistes.
 */
const PROMPTS_METIER: Record<string, string> = {
  carreleur: "Analyse cette photo comme un expert carreleur. Calcule la surface a carreler visible. Identifie le type de support (mur/sol/humide). Propose le carrelage adapte. Calcule les quantites (carrelage + colle + joint + pertes 15%). Liste tous les materiaux avec prix realistes.",
  paysagiste: "Analyse ce jardin/espace exterieur. Estime la surface totale visible. Identifie la vegetation existante. Propose un plan d'amenagement adapte. Liste les plantes recommandees avec quantites. Calcule le volume de terre/mulch necessaire.",
  cuisiniste: "Analyse cette cuisine. Estime les dimensions (lineaire des murs). Identifie le type d'agencement actuel. Propose 2-3 options de renovation. Liste meubles, plan de travail, electromenager recommandes.",
  macon: "Analyse cette surface/structure. Calcule les volumes/surfaces visibles. Identifie les travaux necessaires. Calcule les quantites de materiaux : beton, parpaings, enduit, isolation. Estime la main d'oeuvre.",
  peintre: "Analyse cette piece/surface a peindre. Calcule la surface totale (murs + plafond). Deduis les ouvertures. Identifie l'etat (preparation necessaire ?). Calcule les quantites de peinture (rendement 8-12m²/L, 2 couches).",
  plombier: "Analyse cette installation plomberie/sanitaire. Identifie les equipements visibles. Repere les problemes potentiels. Liste les travaux a effectuer. Propose les equipements de remplacement avec marques (Grohe, Hansgrohe…) et prix marche.",
  electricien: "Analyse cette installation electrique. Identifie tableau, prises, eclairage, conformite NF C 15-100. Liste les travaux de mise aux normes. Propose les materiels avec marques (Legrand, Schneider, Hager) et prix marche.",
  menuisier: "Analyse cette ouvrage bois/menuiserie. Mesure les dimensions visibles. Identifie le type de bois et l'etat. Propose les travaux + bois adapte avec prix marche.",
  chauffagiste: "Analyse cette installation chauffage/climatisation. Identifie l'equipement existant. Calcule les deperditions visibles. Propose la solution adaptee (PAC, chaudiere, radiateurs) avec marques + prix.",
  terrassier: "Analyse cette zone de terrassement. Estime volumes a deplacer en m³. Identifie l'acces engins, les reseaux. Propose le materiel necessaire + prix.",
};

/*
 * Construit les blocs image pour l'appel multimodal (parité legacy) : data:URL → inline base64 ;
 * URL http(s) → fileData (fileUri). PUR.
 */
export function buildImageBlocks(urls: readonly string[]): VisionImage[] {
  return urls.map((url) => {
    const m = String(url || "").match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
    if (m) return { mimeType: m[1], base64: m[2] };
    return { mimeType: "image/jpeg", fileUri: url };
  });
}

/** Construit le system prompt (contexte métier + prompt spécialisé + spécification JSON). PUR. Parité legacy. */
export function buildSystemPrompt(metier: string | null | undefined): string {
  const contexteMetier = getContexteMetier(metier);
  const promptSpecialise = metier && PROMPTS_METIER[String(metier).toLowerCase()] ? PROMPTS_METIER[String(metier).toLowerCase()] : "Analyse les photos fournies et identifie les travaux necessaires.";
  return `${contexteMetier}

${promptSpecialise}

Pour chaque type de travaux detecte, fournis :
- Le type (ex: plomberie, electricite, peinture)
- Une description detaillee
- Le niveau d'urgence (faible | moyenne | haute | critique)
- Un score de confiance 0-100
- La liste des articles/materiaux necessaires (nom, description, quantite, unite, prixEstime EN EUROS TTC marche francais 2024)

Reponds UNIQUEMENT avec un objet JSON brut (pas de markdown, pas de texte autour) :
{"travaux":[{"type":"string","description":"string","urgence":"faible|moyenne|haute|critique","confiance":0,"articles":[{"nom":"string","description":"string","quantite":0,"unite":"string","prixEstime":0}]}]}`;
}

export interface ArticleIA {
  readonly nom?: string;
  readonly description?: string;
  readonly quantite?: number | string;
  readonly unite?: string;
  readonly prixEstime?: number | string;
}
export interface TravailIA {
  readonly type?: string;
  readonly description?: string;
  readonly urgence?: string;
  readonly confiance?: number | string;
  readonly articles?: ArticleIA[];
}

/*
 * Parse robuste de la réponse IA (parité legacy) : supporte le wrap markdown ```json … ```, extrait le
 * 1er objet JSON, valide la présence du tableau `travaux`. Renvoie null si non parsable/format invalide.
 */
export function parseAnalyseResponse(responseText: string): TravailIA[] | null {
  let cleaned = (responseText || "").trim();
  const codeFence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFence) cleaned = codeFence[1].trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
  const travaux = (parsed as { travaux?: unknown })?.travaux;
  return Array.isArray(travaux) ? (travaux as TravailIA[]) : null;
}

/** Retire tout payload data:base64 d'un message d'erreur (anti-fuite de l'image dans la stack) + tronque. */
export function sanitizeVisionError(e: unknown): string {
  let msg = String((e as { message?: string })?.message || e || "Erreur inconnue");
  msg = msg.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "[image]");
  if (msg.length > 200) msg = msg.slice(0, 200) + "…";
  return msg;
}

/** Cherche un article de la bibliothèque dont le nom « matche » (inclusion bidirectionnelle) le nom IA. PUR. */
export function matchBibliotheque(catalogue: readonly { id: number; nom: string }[], nomIA: string | undefined): number | null {
  const n = String(nomIA || "").toLowerCase();
  if (!n) return null;
  const found = catalogue.find((a) => {
    const nb = String(a.nom || "").toLowerCase();
    return nb.length > 0 && (nb.includes(n) || n.includes(nb));
  });
  return found?.id ?? null;
}
