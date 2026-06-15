import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ISubscriptionRepository } from "../../application/subscription-reader";
import type { SubscriptionEffectDeps } from "../../application/use-cases";
import { cancelSubscription, createCheckout, createPortal, getCurrent, reactivateSubscription } from "../../application/use-cases";

const checkoutInput = z.object({
  plan: z.enum(["essentiel", "pro", "entreprise"]),
  interval: z.enum(["month", "year"]),
  extraUsers: z.number().int().min(0).max(50).default(0),
});

// Routeur tRPC abonnement (complet). `getCurrent` (lecture) + checkout/portal/cancel/reactivate (effets
// Stripe via StripePort). `createCheckout` reçoit l'email du tenant depuis les claims du cookie.
export function createSubscriptionRouter(repo: ISubscriptionRepository, effectDeps: SubscriptionEffectDeps) {
  return router({
    getCurrent: protectedProcedure.query(({ ctx }) => getCurrent(repo, ctx.tenant)),

    createCheckout: protectedProcedure
      .input(checkoutInput)
      .mutation(({ ctx, input }) => createCheckout(effectDeps, ctx.tenant, ctx.claims?.email, input)),

    createPortal: protectedProcedure.mutation(({ ctx }) => createPortal(effectDeps, ctx.tenant)),

    cancel: protectedProcedure.mutation(({ ctx }) => cancelSubscription(effectDeps, ctx.tenant)),

    reactivate: protectedProcedure.mutation(({ ctx }) => reactivateSubscription(effectDeps, ctx.tenant)),
  });
}
