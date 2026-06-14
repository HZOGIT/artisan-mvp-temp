import type { TenantContext } from "../../../shared/tenant";
import { computeCurrentSubscription } from "../domain/subscription";
import type { CurrentSubscription } from "../domain/subscription";
import type { ISubscriptionReader } from "./subscription-reader";

// État d'abonnement courant du tenant (essai/quotas calculés). `now` injectable pour le déterminisme.
export async function getCurrent(reader: ISubscriptionReader, ctx: TenantContext, now: () => Date = () => new Date()): Promise<CurrentSubscription> {
  return computeCurrentSubscription(await reader.getSubscription(ctx), now());
}
