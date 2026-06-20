import type { TenantContext } from "../../../shared/tenant";
import type { ISubscriptionRepository } from "../application/subscription-reader";
import type { SubscriptionRow } from "../domain/subscription";

/** Repo fake déterministe : abonnement par tenant (null si non semé) + miroir cancel_at_period_end. */
export class FakeSubscriptionReader implements ISubscriptionRepository {
  private readonly byTenant = new Map<number, SubscriptionRow>();
  private readonly noms = new Map<number, string>();

  seed(artisanId: number, sub: SubscriptionRow): void {
    this.byTenant.set(artisanId, sub);
  }

  setNomEntreprise(artisanId: number, nom: string): void {
    this.noms.set(artisanId, nom);
  }

  async getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null> {
    return this.byTenant.get(ctx.artisanId) ?? null;
  }

  async setCancelAtPeriodEnd(ctx: TenantContext, cancel: boolean): Promise<void> {
    const cur = this.byTenant.get(ctx.artisanId);
    if (cur) this.byTenant.set(ctx.artisanId, { ...cur, cancelAtPeriodEnd: cancel });
  }

  async setStripeCustomerId(_ctx: TenantContext, _customerId: string): Promise<void> {
    /* no-op */
  }

  async getNomEntreprise(ctx: TenantContext): Promise<string | null> {
    return this.noms.get(ctx.artisanId) ?? null;
  }
}

export function blankSub(artisanId: number): SubscriptionRow {
  return { id: 0, artisanId, plan: "trial", status: "trialing", trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, maxUsers: 1, maxDevicesPerUser: 3, maxConcurrentSessions: 2 };
}
