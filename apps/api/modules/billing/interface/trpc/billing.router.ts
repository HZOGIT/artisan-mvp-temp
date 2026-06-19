import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { BillingDeps } from "../../application/billing-use-cases";
import {
  createSetupIntent,
  confirmPaymentMethod,
  revokePaymentMethod,
  setDefaultPaymentMethod,
  getBillingInfo,
  changePlan,
  NotFoundError,
  InvalidPlanError,
} from "../../application/billing-use-cases";
import { TRPCError } from "@trpc/server";

function mapError(err: unknown): never {
  if (err instanceof NotFoundError) throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  if (err instanceof InvalidPlanError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

export function createBillingRouter(deps: BillingDeps) {
  return router({
    /** Étape 1 SetupIntent : retourne le clientSecret pour Stripe Elements. */
    createSetupIntent: protectedProcedure.mutation(({ ctx }) =>
      createSetupIntent(deps, ctx.tenant).catch(mapError),
    ),

    /** Étape 2 : confirme la carte après Stripe Elements et la persiste. */
    confirmPaymentMethod: protectedProcedure
      .input(
        z.object({
          stripePaymentMethodId: z.string().min(1),
          stripeCustomerId: z.string().min(1),
          setAsDefault: z.boolean().default(true),
        }),
      )
      .mutation(({ ctx, input }) =>
        confirmPaymentMethod(deps, ctx.tenant, {
          stripePaymentMethodId: input.stripePaymentMethodId,
          stripeCustomerId: input.stripeCustomerId,
          setAsDefault: input.setAsDefault,
          consentedAt: new Date(),
        }).catch(mapError),
      ),

    /** Révoque (soft-delete) un moyen de paiement. */
    revokePaymentMethod: protectedProcedure
      .input(z.object({ paymentMethodId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        revokePaymentMethod(deps, ctx.tenant, input.paymentMethodId).catch(mapError),
      ),

    /** Change la carte par défaut + met à jour l'abonnement. */
    setDefaultPaymentMethod: protectedProcedure
      .input(z.object({ paymentMethodId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        setDefaultPaymentMethod(deps, ctx.tenant, input.paymentMethodId).catch(mapError),
      ),

    /** Change de plan (upgrade ou downgrade). */
    changePlan: protectedProcedure
      .input(z.object({ planId: z.enum(["starter", "pro", "enterprise"]) }))
      .mutation(({ ctx, input }) =>
        changePlan(deps, ctx.tenant, input.planId).catch(mapError),
      ),

    /** Retourne subscription + cartes + 12 dernières factures. */
    getBillingInfo: protectedProcedure.query(({ ctx }) =>
      getBillingInfo(deps, ctx.tenant),
    ),
  });
}
