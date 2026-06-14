import type { TenantContext } from "../../../shared/tenant";
import type { ISubscriptionReader } from "../application/subscription-reader";
import type { SubscriptionRow } from "../domain/subscription";

// Lecteur fake déterministe : abonnement par tenant (null si non semé).
export class FakeSubscriptionReader implements ISubscriptionReader {
  private readonly byTenant = new Map<number, SubscriptionRow>();

  seed(artisanId: number, sub: SubscriptionRow): void {
    this.byTenant.set(artisanId, sub);
  }

  async getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null> {
    return this.byTenant.get(ctx.artisanId) ?? null;
  }
}
