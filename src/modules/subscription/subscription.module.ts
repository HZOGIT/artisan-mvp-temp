import type { StripePort } from "../../shared/ports/stripe";
import type { ISubscriptionRepository } from "./application/subscription-reader";
import type { SubscriptionEffectDeps } from "./application/use-cases";
import { createSubscriptionRouter } from "./interface/trpc/subscription.router";

// Wiring DI du module abonnement (lecture `getCurrent` + effets Stripe cancel/reactivate).
export interface SubscriptionModuleDeps {
  readonly repository: ISubscriptionRepository;
  readonly stripe: StripePort;
  readonly appUrl: string;
}

export interface SubscriptionModule {
  readonly deps: SubscriptionModuleDeps;
  readonly router: ReturnType<typeof createSubscriptionRouter>;
}

export function createSubscriptionModule(deps: SubscriptionModuleDeps): SubscriptionModule {
  const effectDeps: SubscriptionEffectDeps = { repo: deps.repository, stripe: deps.stripe, appUrl: deps.appUrl };
  return { deps, router: createSubscriptionRouter(deps.repository, effectDeps) };
}
