import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ISearchReader } from "../../application/search-reader";
import { globalSearch } from "../../application/use-cases";

/** Routeur tRPC de la recherche globale. Surface client = `global` (palette de recherche cross-domaine). */
export function createSearchRouter(reader: ISearchReader) {
  return router({
    global: protectedProcedure
      .input(z.object({ query: z.string().min(1).max(100) }))
      .query(({ ctx, input }) => globalSearch(reader, ctx.tenant, input.query)),
  });
}
