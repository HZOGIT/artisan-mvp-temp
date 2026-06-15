import type { TenantContext } from "../../../shared/tenant";
import type { ISubscriptionRepository } from "../application/subscription-reader";
import type { SubscriptionRow } from "../domain/subscription";

// Repo fake déterministe : abonnement par tenant (null si non semé) + miroir cancel_at_period_end.
export class FakeSubscriptionReader implements ISubscriptionRepository {
  private readonly byTenant = new Map<number, SubscriptionRow>();

  seed(artisanId: number, sub: SubscriptionRow): void {
    this.byTenant.set(artisanId, sub);
  }

  async getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null> {
    return this.byTenant.get(ctx.artisanId) ?? null;
  }

  async setCancelAtPeriodEnd(ctx: TenantContext, cancel: boolean): Promise<void> {
    const cur = this.byTenant.get(ctx.artisanId);
    if (cur) this.byTenant.set(ctx.artisanId, { ...cur, cancelAtPeriodEnd: cancel });
  }
}
