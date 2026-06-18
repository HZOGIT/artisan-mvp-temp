import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `devis-ia` (éditeur de devis IA : photos → travaux détectés → articles
// éditables → devis). Types dérivés du routeur, état éditable + agrégats purs testables. 0 React/tRPC.

export type Analyse = RouterOutputs["devisIA"]["list"][number];
export type AnalyseDetail = NonNullable<RouterOutputs["devisIA"]["getById"]>;
export type Resultat = AnalyseDetail["resultats"][number];
export type Suggestion = Resultat["suggestions"][number];
export type Client = RouterOutputs["clients"]["list"][number];

export const TVA_RATE = 0.2;

// Modèle d'édition local d'une suggestion (quantité numérique pour les inputs).
export type SuggestionEditable = {
  id: number; nomArticle: string; quantiteSuggeree: number; unite: string;
  prixEstime: string; selectionne: boolean; confiance: number; isNew?: boolean;
};

// Mappe une suggestion serveur → modèle éditable (coercitions string→number). PUR.
export function suggestionToEditable(s: Suggestion): SuggestionEditable {
  return {
    id: s.id, nomArticle: s.nomArticle ?? "", quantiteSuggeree: Number(s.quantiteSuggeree || 0),
    unite: s.unite || "unité", prixEstime: String(s.prixEstime ?? "0"),
    selectionne: !!s.selectionne, confiance: Number(s.confiance || 0),
  };
}

// Construit la map d'édition (id → éditable) depuis le détail de l'analyse. PUR.
export function buildEditedMap(resultats: readonly Resultat[]): Record<number, SuggestionEditable> {
  const map: Record<number, SuggestionEditable> = {};
  for (const r of resultats) for (const s of r.suggestions || []) map[s.id] = suggestionToEditable(s);
  return map;
}

// Fabrique une nouvelle suggestion vierge (id local = timestamp). PUR (now injectable).
export function newSuggestion(now: number = Date.now()): SuggestionEditable {
  return { id: now, nomArticle: "", quantiteSuggeree: 1, unite: "unité", prixEstime: "0", selectionne: true, confiance: 100, isNew: true };
}

// Total d'une ligne (quantité × prix). PUR.
export function lineTotal(s: SuggestionEditable): number {
  return s.quantiteSuggeree * parseFloat(s.prixEstime || "0");
}

// Total HT des suggestions sélectionnées (existantes + nouvelles). PUR.
export function calculateTotal(edited: Record<number, SuggestionEditable>, news: readonly SuggestionEditable[]): number {
  const sum = (list: SuggestionEditable[]) => list.reduce((t, s) => (s.selectionne ? t + lineTotal(s) : t), 0);
  return sum(Object.values(edited)) + sum([...news]);
}

// Nombre d'articles sélectionnés (existants + nouveaux). PUR.
export function selectedCount(edited: Record<number, SuggestionEditable>, news: readonly SuggestionEditable[]): number {
  return Object.values(edited).filter((s) => s.selectionne).length + news.filter((s) => s.selectionne).length;
}

// Classe de la pastille d'urgence. PUR.
export function urgenceColor(urgence: string | null): string {
  switch (urgence) {
    case "critique": return "bg-red-100 text-red-800";
    case "haute": return "bg-orange-100 text-orange-800";
    case "faible": return "bg-gray-100 text-gray-800";
    default: return "bg-blue-100 text-blue-800"; // moyenne
  }
}

// Variante shadcn d'un statut d'analyse (libellé via i18n `statut.<statut>`). PUR.
export function statutVariant(statut: string): "default" | "secondary" | "destructive" {
  if (statut === "termine") return "default";
  if (statut === "erreur") return "destructive";
  return "secondary"; // en_attente / en_cours
}

// Payload de mise à jour d'une suggestion (quantité en chaîne, cf. backend). PUR.
export function buildUpdatePayload(s: SuggestionEditable): { id: number; selectionne: boolean; quantiteSuggeree: string; prixEstime: string } {
  return { id: s.id, selectionne: s.selectionne, quantiteSuggeree: s.quantiteSuggeree.toString(), prixEstime: s.prixEstime };
}
