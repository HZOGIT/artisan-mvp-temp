import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IDevisStatsReader } from "../../application/devis-stats-reader";
import { getDevisStats } from "../../application/use-cases";

/** Routeur tRPC des statistiques. Surface client = `getDevisStats` (agrégats devis du tenant). */
export function createStatistiquesRouter(reader: IDevisStatsReader) {
  return router({
    getDevisStats: protectedProcedure.query(({ ctx }) => getDevisStats(reader, ctx.tenant)),
  });
}
