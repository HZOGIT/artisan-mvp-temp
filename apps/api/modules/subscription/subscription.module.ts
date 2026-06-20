import type { ISubscriptionReader } from "./application/subscription-reader";
import { createSubscriptionRouter } from "./interface/trpc/subscription.router";

export interface SubscriptionModule {
  readonly router: ReturnType<typeof createSubscriptionRouter>;
}

export function createSubscriptionModule(reader: ISubscriptionReader): SubscriptionModule {
  return { router: createSubscriptionRouter(reader) };
}
