import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ITechnicienPositionReader } from "../../application/position-reader";
import { getPositions } from "../../application/use-cases";

// Routeur tRPC de la géolocalisation. Surface client = `getPositions` (dernières positions des
// techniciens du tenant). Lecture seule, scopée tenant.
export function createGeolocalisationRouter(reader: ITechnicienPositionReader) {
  return router({
    getPositions: protectedProcedure.query(({ ctx }) => getPositions(reader, ctx.tenant)),
  });
}
