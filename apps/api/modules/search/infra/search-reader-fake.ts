import type { TenantContext } from "../../../shared/tenant";
import type { ISearchReader } from "../application/search-reader";
import type { SearchMatches } from "../domain/search";

const EMPTY: SearchMatches = { clients: [], devis: [], factures: [], interventions: [], fournisseurs: [] };

/*
 * Lecteur fake déterministe : renvoie des correspondances préprogrammées par tenant et capture la
 * dernière requête reçue (assertions sur la garde de longueur côté use-case).
 */
export class FakeSearchReader implements ISearchReader {
  private readonly matches = new Map<number, SearchMatches>();
  public lastQuery: string | null = null;
  public callCount = 0;

  seed(artisanId: number, matches: Partial<SearchMatches>): void {
    this.matches.set(artisanId, { ...EMPTY, ...matches });
  }

  async search(ctx: TenantContext, query: string): Promise<SearchMatches> {
    this.lastQuery = query;
    this.callCount++;
    return this.matches.get(ctx.artisanId) ?? EMPTY;
  }
}
