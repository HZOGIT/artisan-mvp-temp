import type { TenantContext } from "../../../shared/tenant";
import type { ISubscriptionReader } from "../application/subscription-reader";
import type { SubscriptionRow } from "../domain/subscription";

export class FakeSubscriptionReader implements ISubscriptionReader {
  private readonly byTenant = new Map<number, SubscriptionRow>();

  seed(artisanId: number, sub: SubscriptionRow): void {
    this.byTenant.set(artisanId, sub);
  }

  async getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null> {
    return this.byTenant.get(ctx.artisanId) ?? null;
  }
}

export function blankSub(artisanId: number): SubscriptionRow {
  return { id: 0, artisanId, plan: "trial", status: "trialing", trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, maxUsers: 1, maxDevicesPerUser: 3, maxConcurrentSessions: 2 };
}
