import { router, protectedProcedure, ownerProcedure } from "../../../../interface/trpc/trpc";
import type { ConnectDeps } from "../../application/use-cases";
import { startOnboarding, getConnectStatus } from "../../application/use-cases";

export function createConnectRouter(deps: ConnectDeps) {
  return router({
    startOnboarding: ownerProcedure.mutation(({ ctx }) => startOnboarding(deps, ctx.tenant)),
    status: protectedProcedure.query(({ ctx }) => getConnectStatus(deps, ctx.tenant)),
  });
}
