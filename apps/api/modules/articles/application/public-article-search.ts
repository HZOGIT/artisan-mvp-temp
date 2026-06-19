/*
 * Recherche PUBLIQUE du catalogue de référence (`bibliotheque_articles`, global — pas de tenant).
 * Route HORS-tRPC `/api/articles/search` (autocomplete). Forme de sortie = snake_case legacy (parité
 * du contrat client). Le catalogue est public (visible=true), aucune donnée tenant.
 */

export interface PublicArticleRow {
  readonly id: number;
  readonly nom: string;
  readonly description: string | null;
  readonly prix_base: string;
  readonly unite: string;
  readonly metier: string;
  readonly categorie: string;
  readonly sous_categorie: string;
  readonly duree_moyenne_minutes: number | null;
}

export interface PublicArticleSearchFilters {
  readonly metier?: string;
  readonly categorie?: string;
  readonly sousCategorie?: string;
}

export interface PublicArticleSearchReader {
  search(q: string, filters: PublicArticleSearchFilters): Promise<PublicArticleRow[]>;
}

// Requête de recherche exploitable ? (parité legacy : < 2 caractères → pas de requête, renvoie []).
export function isSearchable(q: string): boolean {
  return q.trim().length >= 2;
}
