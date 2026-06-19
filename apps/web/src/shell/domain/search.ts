import type { RouterOutputs } from "@/shared/trpc";

/*
 * DOMAIN recherche globale (Ctrl+K) du SHELL : groupage PUR des résultats par type (ordre fixe) + aplatissement
 * pour la navigation clavier. PORT FIDÈLE de GlobalSearch. Typé via RouterOutputs (0 any).
 */
export type SearchResult = RouterOutputs["search"]["global"]["results"][number];
export interface SearchGroup { type: string; items: SearchResult[]; }

const GROUP_ORDER = ["client", "devis", "facture", "intervention", "fournisseur"];

/** Groupe les résultats par type dans l'ordre fixe, en retirant les groupes vides. PUR. */
export function groupResults(results: readonly SearchResult[]): SearchGroup[] {
  const map = new Map<string, SearchResult[]>();
  for (const r of results) {
    const arr = map.get(r.type) || [];
    arr.push(r);
    map.set(r.type, arr);
  }
  return GROUP_ORDER.map((type) => ({ type, items: map.get(type) || [] })).filter((g) => g.items.length > 0);
}

/** Liste aplatie (ordre du groupage) pour la navigation clavier ↑↓↵. PUR. */
export function flattenGroups(grouped: SearchGroup[]): SearchResult[] {
  return grouped.flatMap((g) => g.items);
}
