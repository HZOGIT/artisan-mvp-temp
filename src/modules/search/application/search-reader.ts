import type { TenantContext } from "../../../shared/tenant";
import type { SearchMatches } from "../domain/search";

// Port de lecture de la recherche globale : lignes brutes scopées tenant correspondant à `query`
// (les bornes/limites par entité sont appliquées par l'implémentation, parité legacy).
export interface ISearchReader {
  search(ctx: TenantContext, query: string): Promise<SearchMatches>;
}
