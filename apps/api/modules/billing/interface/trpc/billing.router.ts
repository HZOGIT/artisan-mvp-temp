import { z } from "zod";
import { router, protectedProcedure, ownerProcedure } from "../../../../interface/trpc/trpc";
import type { BillingDeps } from "../../application/billing-use-cases";
import {
  createSetupIntent,
  confirmPaymentMethod,
  revokePaymentMethod,
  setDefaultPaymentMethod,
  getBillingInfo,
  changePlan,
  previewPlanChange,
  cancelAtPeriodEnd,
  reactivateSubscription,
  activateOnboardingSubscription,
  downloadSubscriptionInvoice,
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
    createSetupIntent: ownerProcedure.mutation(({ ctx }) =>
      createSetupIntent(deps, ctx.tenant).catch(mapError),
    ),

    /** Étape 2 : confirme la carte après Stripe Elements et la persiste. */
    confirmPaymentMethod: ownerProcedure
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
    revokePaymentMethod: ownerProcedure
      .input(z.object({ paymentMethodId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        revokePaymentMethod(deps, ctx.tenant, input.paymentMethodId).catch(mapError),
      ),

    /** Change la carte par défaut + met à jour l'abonnement. */
    setDefaultPaymentMethod: ownerProcedure
      .input(z.object({ paymentMethodId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        setDefaultPaymentMethod(deps, ctx.tenant, input.paymentMethodId).catch(mapError),
      ),

    /** Aperçu des effets d'un changement de plan (sans modification). */
    previewPlanChange: protectedProcedure
      .input(z.object({ planId: z.enum(["starter", "pro", "enterprise"]) }))
      .query(({ ctx, input }) =>
        previewPlanChange(deps, ctx.tenant, input.planId).catch(mapError),
      ),

    /** Change de plan (upgrade ou downgrade). */
    changePlan: ownerProcedure
      .input(z.object({ planId: z.enum(["starter", "pro", "enterprise"]) }))
      .mutation(({ ctx, input }) =>
        changePlan(deps, ctx.tenant, input.planId).catch(mapError),
      ),

    /** Programme l'annulation à la fin de la période en cours. */
    cancelAtPeriodEnd: ownerProcedure.mutation(({ ctx }) =>
      cancelAtPeriodEnd(deps, ctx.tenant).catch(mapError),
    ),

    /** Annule l'annulation programmée (réactivation). */
    reactivate: ownerProcedure.mutation(({ ctx }) =>
      reactivateSubscription(deps, ctx.tenant).catch(mapError),
    ),

    /** Retourne subscription + cartes + 12 dernières factures. */
    getBillingInfo: ownerProcedure.query(({ ctx }) =>
      getBillingInfo(deps, ctx.tenant),
    ),

    /** Fin d'onboarding avec plan : crée un abonnement trialing J+15. */
    activateOnboardingSubscription: ownerProcedure
      .input(
        z.object({
          planId: z.enum(["starter", "pro", "enterprise"]),
          paymentMethodId: z.number().int().positive(),
        }),
      )
      .mutation(({ ctx, input }) =>
        activateOnboardingSubscription(deps, ctx.tenant, input).catch(mapError),
      ),

    /** Génère (ou retourne) le PDF de la facture d'abonnement. */
    downloadInvoice: ownerProcedure
      .input(z.object({ invoiceId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        downloadSubscriptionInvoice(deps, ctx.tenant, input.invoiceId).catch(mapError),
      ),
  });
}
