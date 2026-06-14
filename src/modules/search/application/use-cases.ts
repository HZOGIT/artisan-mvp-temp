import type { TenantContext } from "../../../shared/tenant";
import { buildSearchResults } from "../domain/search";
import type { SearchResult } from "../domain/search";
import type { ISearchReader } from "./search-reader";

// Recherche globale du tenant. Garde legacy : requête trimée < 2 caractères → résultat vide SANS
// toucher la base (évite des `%a%` trop larges). Sinon : lecture scopée + projection pure.
export async function globalSearch(reader: ISearchReader, ctx: TenantContext, query: string): Promise<{ results: SearchResult[] }> {
  const q = query.trim();
  if (q.length < 2) return { results: [] };
  return { results: buildSearchResults(await reader.search(ctx, q)) };
}
