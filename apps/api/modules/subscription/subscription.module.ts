import type { StripePort } from "../../shared/ports/stripe";
import type { SubscriptionPrices } from "./domain/subscription";
import type { ISubscriptionRepository } from "./application/subscription-reader";
import type { SubscriptionEffectDeps } from "./application/use-cases";
import { createSubscriptionRouter } from "./interface/trpc/subscription.router";

/** Wiring DI du module abonnement (lecture `getCurrent` + effets Stripe checkout/portal/cancel/reactivate). */
export interface SubscriptionModuleDeps {
  readonly repository: ISubscriptionRepository;
  readonly stripe: StripePort;
  readonly prices: SubscriptionPrices;
  readonly appUrl: string;
}

export interface SubscriptionModule {
  readonly deps: SubscriptionModuleDeps;
  readonly router: ReturnType<typeof createSubscriptionRouter>;
}

export function createSubscriptionModule(deps: SubscriptionModuleDeps): SubscriptionModule {
  const effectDeps: SubscriptionEffectDeps = { repo: deps.repository, stripe: deps.stripe, prices: deps.prices, appUrl: deps.appUrl };
  return { deps, router: createSubscriptionRouter(deps.repository, effectDeps) };
}

/** Résout la config des price IDs depuis l'environnement (parité legacy `STRIPE_PRICE_*`). */
export function pricesFromEnv(env: NodeJS.ProcessEnv = process.env): SubscriptionPrices {
  return {
    essentiel: { month: env.STRIPE_PRICE_ESSENTIEL_MONTH, year: env.STRIPE_PRICE_ESSENTIEL_YEAR },
    pro: { month: env.STRIPE_PRICE_PRO_MONTH, year: env.STRIPE_PRICE_PRO_YEAR },
    entreprise: { month: env.STRIPE_PRICE_ENTREPRISE_MONTH, year: env.STRIPE_PRICE_ENTREPRISE_YEAR },
    extra: {
      pro: { month: env.STRIPE_PRICE_EXTRA_USER_PRO_MONTH, year: env.STRIPE_PRICE_EXTRA_USER_PRO_YEAR },
      entreprise: { month: env.STRIPE_PRICE_EXTRA_USER_ENT_MONTH, year: env.STRIPE_PRICE_EXTRA_USER_ENT_YEAR },
    },
  };
}
