import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ISubscriptionReader } from "../../application/subscription-reader";
import { getCurrent } from "../../application/use-cases";

export function createSubscriptionRouter(repo: ISubscriptionReader) {
  return router({
    getCurrent: protectedProcedure.query(({ ctx }) => getCurrent(repo, ctx.tenant)),
  });
}
