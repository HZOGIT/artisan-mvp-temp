import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ISubscriptionRepository } from "../../application/subscription-reader";
import type { SubscriptionEffectDeps } from "../../application/use-cases";
import { cancelSubscription, getCurrent, reactivateSubscription } from "../../application/use-cases";

// Routeur tRPC abonnement. `getCurrent` (lecture) + `cancel`/`reactivate` (effets Stripe via StripePort).
// `createCheckout`/`createPortal` viennent ensuite (firing dédié) avant l'activation.
export function createSubscriptionRouter(repo: ISubscriptionRepository, effectDeps: SubscriptionEffectDeps) {
  return router({
    getCurrent: protectedProcedure.query(({ ctx }) => getCurrent(repo, ctx.tenant)),
    cancel: protectedProcedure.mutation(({ ctx }) => cancelSubscription(effectDeps, ctx.tenant)),
    reactivate: protectedProcedure.mutation(({ ctx }) => reactivateSubscription(effectDeps, ctx.tenant)),
  });
}
