/*
 * Constructeurs de prompts + parseurs des 4 générateurs IA de l'assistant (parité legacy
 * `assistantRouter`). Purs et testables. La sortie LLM n'est PAS fiable → parse défensif.
 */

export interface PromptParts {
  readonly system: string;
  readonly user: string;
  readonly temperature: number;
  readonly maxOutputTokens: number;
}

/** ── suggestRelances ────────────────────────────────────────────────────────────────────────────── */
export interface RelanceItem {
  readonly numero: string;
  readonly objet: string | null;
  readonly totalTTC: string;
  readonly jours: number;
  readonly client: string;
}

export function buildSuggestRelancesPrompt(items: readonly RelanceItem[]): PromptParts {
  const liste = items
    .map((d) => `- Devis ${d.numero} (${d.objet || "sans objet"}) : ${d.totalTTC}€ TTC, envoyé il y a ${d.jours} jours à ${d.client}`)
    .join("\n");
  return {
    system:
      'Tu es un assistant qui génère des emails de relance professionnels et personnalisés pour un artisan. Pour chaque devis, génère un email court et cordial. Réponds en JSON : [{"numero":"...","objet":"...","email":{"sujet":"...","corps":"..."}}]',
    user: `Génère des emails de relance pour ces devis :\n${liste}`,
    temperature: 0.7,
    maxOutputTokens: 2000,
  };
}

/** Parité legacy STRICTE : extrait le 1er tableau JSON ; si parse impossible → `[{error: text}]`. */
export function parseRelances(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [{ error: text }];
  try {
    const data = JSON.parse(match[0]);
    return Array.isArray(data) ? data : [{ error: text }];
  } catch {
    return [{ error: text }];
  }
}

/** ── generateDevis ──────────────────────────────────────────────────────────────────────────────── */
export function buildGenerateDevisPrompt(description: string, catalogue: string): PromptParts {
  return {
    system: `Tu es un assistant spécialisé dans la génération de devis pour artisans. Tu dois générer des lignes de devis au format JSON.
Catalogue d'articles disponibles :\n${catalogue}\n\nRéponds UNIQUEMENT avec un tableau JSON (pas de texte autour) au format :
[{"designation":"...","quantite":1,"unite":"u","prixUnitaireHT":0,"tauxTVA":20}]`,
    user: `Génère les lignes de devis pour : ${description}`,
    temperature: 0.3,
    maxOutputTokens: 2000,
  };
}

/** Parité legacy : extrait le 1er tableau JSON ; si parse impossible → []. */
export function parseDevisLignes(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const data = JSON.parse(match[0]);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** ── analyseRentabilite ─────────────────────────────────────────────────────────────────────────── */
export interface DevisAnalyseLigne {
  readonly designation: string;
  readonly quantite: string;
  readonly unite: string;
  readonly prixUnitaireHT: string;
  readonly tauxTVA: string;
}
export interface DevisAnalyseData {
  readonly numero: string;
  readonly totalHT: string;
  readonly totalTTC: string;
  readonly clientNom: string;
  readonly lignes: readonly DevisAnalyseLigne[];
  /** tarifs habituels (catalogue articles artisan), pré-formaté par le reader */
  readonly tarifs: string;
}

export function buildAnalyseRentabilitePrompt(data: DevisAnalyseData): PromptParts {
  const detailLignes = data.lignes
    .map((l) => `- ${l.designation}: ${l.quantite} ${l.unite} x ${l.prixUnitaireHT}€ HT (TVA ${l.tauxTVA}%)`)
    .join("\n");
  return {
    system:
      "Tu es un expert en analyse de rentabilité pour artisans. Analyse ce devis, compare les prix aux tarifs habituels, estime la marge, et donne des recommandations concrètes. Réponds en français avec du markdown.",
    user: `Analyse ce devis :\nDevis ${data.numero} pour ${data.clientNom}\nTotal HT: ${data.totalHT}€ | Total TTC: ${data.totalTTC}€\n\nLignes :\n${detailLignes}\n\nTarifs habituels de l'artisan :\n${data.tarifs || "Non disponibles"}`,
    temperature: 0.5,
    maxOutputTokens: 2000,
  };
}

/** ── predictionTresorerie ───────────────────────────────────────────────────────────────────────── */
export interface TresorerieData {
  readonly facturesPayees: string;
  readonly facturesImpayees: string;
  readonly devisAcceptes: string;
}

export function buildPredictionTresoreriePrompt(data: TresorerieData): PromptParts {
  return {
    system:
      "Tu es un expert en gestion de trésorerie pour artisans. Analyse les données financières et prédit les entrées/sorties sur les 3 prochains mois. Donne des alertes si tension de trésorerie. Réponds en français avec du markdown.",
    user: `Données financières :\n\nFactures payées récentes :\n${data.facturesPayees || "Aucune"}\n\nFactures impayées :\n${data.facturesImpayees || "Aucune"}\n\nDevis acceptés (à facturer) :\n${data.devisAcceptes || "Aucun"}`,
    temperature: 0.5,
    maxOutputTokens: 2000,
  };
}

/** Nombre de jours écoulés depuis une date (suggestRelances : seuil de relance à 7 j). */
export function joursDepuis(date: Date, maintenant: Date): number {
  return Math.floor((maintenant.getTime() - date.getTime()) / 86_400_000);
}
