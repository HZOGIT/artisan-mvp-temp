import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ISubscriptionReader } from "../../application/subscription-reader";
import { getCurrent } from "../../application/use-cases";

// Routeur tRPC abonnement — slice LECTURE (`getCurrent`). Les effets Stripe (createCheckout/createPortal/
// cancel/reactivate) + le webhook signé viennent dans des firings ultérieurs avant l'activation.
export function createSubscriptionRouter(reader: ISubscriptionReader) {
  return router({
    getCurrent: protectedProcedure.query(({ ctx }) => getCurrent(reader, ctx.tenant)),
  });
}
