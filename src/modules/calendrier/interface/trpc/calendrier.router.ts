import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IIcalFeedRepository, TokenGenerator } from "../../application/ical-feed-repository";
import { getIcalFeed, regenerateIcalFeed } from "../../application/use-cases";

// Routeur tRPC du calendrier. Surface client : getIcalFeed (génère le jeton à la 1re demande) +
// regenerateIcalFeed (rotation du jeton). Le flux `.ics` lui-même est servi hors tRPC (route publique).
export function createCalendrierRouter(repo: IIcalFeedRepository, genererToken: TokenGenerator) {
  return router({
    getIcalFeed: protectedProcedure.query(({ ctx }) => getIcalFeed(repo, genererToken, ctx.tenant)),

    regenerateIcalFeed: protectedProcedure.mutation(({ ctx }) => regenerateIcalFeed(repo, genererToken, ctx.tenant)),
  });
}
