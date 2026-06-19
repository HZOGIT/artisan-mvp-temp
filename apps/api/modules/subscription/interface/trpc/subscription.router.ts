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

/*
 * Routeur tRPC abonnement (complet). `getCurrent` (lecture) + checkout/portal/cancel/reactivate (effets
 * Stripe via StripePort). `createCheckout` reçoit l'email du tenant depuis les claims du cookie.
 */
export function createSubscriptionRouter(repo: ISubscriptionRepository, effectDeps: SubscriptionEffectDeps) {
  return router({
    getCurrent: protectedProcedure.query(({ ctx }) => getCurrent(repo, ctx.tenant)),

    createCheckout: protectedProcedure
      .input(checkoutInput)
      .mutation(async ({ ctx, input }) => {
        const result = await createCheckout(effectDeps, ctx.tenant, ctx.claims?.email, input);
        ctx.log.info({ event: "subscription_checkout_started", plan: input.plan, interval: input.interval, extraUsers: input.extraUsers }, `Checkout abonnement initié (${input.plan} ${input.interval})`);
        return result;
      }),

    createPortal: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await createPortal(effectDeps, ctx.tenant);
      ctx.log.info({ event: "subscription_portal_opened" }, "Portail facturation Stripe ouvert");
      return result;
    }),

    cancel: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await cancelSubscription(effectDeps, ctx.tenant);
      ctx.log.warn({ event: "subscription_cancelled" }, "Abonnement annulé");
      return result;
    }),

    reactivate: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await reactivateSubscription(effectDeps, ctx.tenant);
      ctx.log.info({ event: "subscription_reactivated" }, "Abonnement réactivé");
      return result;
    }),
  });
}
