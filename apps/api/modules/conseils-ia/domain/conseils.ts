/*
 * Domaine CONSEILS IA (recommandations personnalisées du tableau de bord). Lecture seule, NON
 * persistée : l'IA propose 3 conseils actionnables à partir de stats minimales du tenant. Parité
 * legacy `conseilsIA` (server/routers.ts). Aucune donnée sensible (montants agrégés du seul tenant).
 */

/** Un conseil affiché sur le tableau de bord (carte + bouton d'action vers un lien interne). */
export interface Conseil {
  readonly icone: string;
  readonly titre: string;
  readonly message: string;
  readonly actionLabel: string;
  readonly actionLien: string;
}

export interface ConseilsResult {
  readonly conseils: Conseil[];
  readonly genereLe?: string;
}

/** Stats minimales servant à personnaliser le prompt (best-effort : zéros si indisponibles). */
export interface ConseilsStats {
  readonly nbDevisEnAttente: number;
  readonly nbFacturesImpayees: number;
  readonly montantImpayees: number;
  readonly nbStocksBas: number;
}

export const CONSEILS_VIDE: ConseilsResult = { conseils: [] };

/** Liens internes autorisés dans les conseils (cohérence avec la navigation de l'app). */
const LIENS_AUTORISES = [
  "/devis",
  "/factures",
  "/relances",
  "/clients",
  "/interventions",
  "/stocks",
  "/tableau-bord-depenses",
  "/alertes-previsions",
  "/depenses",
  "/budgets-depenses",
];

/** Prompt utilisateur (parité legacy) : décrit l'état du tenant et demande 3 conseils en JSON pur. */
export function buildConseilsPrompt(input: {
  nomEntreprise: string | null;
  metier: string | null;
  stats: ConseilsStats;
  moisLabel: string;
}): string {
  return `Tu es le conseiller IA d'Operioz pour ${input.nomEntreprise || "cet artisan"} (${input.metier || "batiment"}).

Etat actuel :
- ${input.stats.nbDevisEnAttente} devis en attente de reponse
- ${input.stats.nbFacturesImpayees} factures en attente de reglement (${input.stats.montantImpayees.toFixed(0)} EUR)
- ${input.stats.nbStocksBas} articles en stock bas
- Mois en cours : ${input.moisLabel}

Donne 3 conseils personnalises ET actionnables (pas de generalites). Chaque conseil a un titre court, un message en 1-2 phrases, une action concrete avec un lien interne d'Operioz, et un icone emoji.

Liens disponibles : ${LIENS_AUTORISES.join(", ")}.

Reponds UNIQUEMENT en JSON pur :
{"conseils":[{"icone":"💡","titre":"court","message":"phrase","actionLabel":"texte bouton","actionLien":"/devis"}]}`;
}

/*
 * Parse défensif de la sortie LLM (non fiable) : extrait le 1er objet JSON, coerce chaque conseil,
 * borne à 3. Renvoie [] si non parsable. Le lien est validé contre la liste autorisée (défaut /devis).
 */
export function parseConseils(text: string): Conseil[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  let data: unknown;
  try {
    data = JSON.parse(match[0]);
  } catch {
    /* ponytail: best-effort — JSON LLM malformé, fallback vide */
    return [];
  }
  const liste = (data as { conseils?: unknown }).conseils;
  if (!Array.isArray(liste)) return [];
  return liste.slice(0, 3).map((c) => toConseil(c as Record<string, unknown>));
}

function toConseil(c: Record<string, unknown>): Conseil {
  const lien = String(c.actionLien ?? "").trim();
  return {
    icone: String(c.icone ?? "💡").slice(0, 8),
    titre: String(c.titre ?? "").slice(0, 120),
    message: String(c.message ?? "").slice(0, 300),
    actionLabel: String(c.actionLabel ?? "").slice(0, 60),
    actionLien: LIENS_AUTORISES.includes(lien) ? lien : "/devis",
  };
}
