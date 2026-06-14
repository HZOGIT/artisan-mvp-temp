import type { ISubscriptionReader } from "./application/subscription-reader";
import { createSubscriptionRouter } from "./interface/trpc/subscription.router";

// Wiring DI du module abonnement (slice lecture).
export interface SubscriptionModuleDeps {
  readonly reader: ISubscriptionReader;
}

export interface SubscriptionModule {
  readonly deps: SubscriptionModuleDeps;
  readonly router: ReturnType<typeof createSubscriptionRouter>;
}

export function createSubscriptionModule(deps: SubscriptionModuleDeps): SubscriptionModule {
  return { deps, router: createSubscriptionRouter(deps.reader) };
}
