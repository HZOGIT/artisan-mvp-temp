import type { SubscriptionUpsertFields } from "../domain/webhook";
import type { SubscriptionWebhookWriter } from "../application/subscription-webhook-writer";

/** Writer webhook fake (in-memory) pour les tests des use-cases. */
export class FakeSubscriptionWebhookWriter implements SubscriptionWebhookWriter {
  private byCustomer = new Map<string, number>();
  public upserts: Array<{ artisanId: number; fields: SubscriptionUpsertFields }> = [];
  public deletes: Array<{ artisanId: number; plan: string; status: string }> = [];
  public statusAndPeriods: Array<{ artisanId: number; status: string; currentPeriodEnd: Date | null }> = [];
  public statuses: Array<{ artisanId: number; status: string }> = [];

  seedCustomer(customerId: string, artisanId: number): void {
    this.byCustomer.set(customerId, artisanId);
  }

  async getArtisanIdByCustomerId(customerId: string): Promise<number | null> {
    return this.byCustomer.get(customerId) ?? null;
  }
  async applyUpsert(artisanId: number, fields: SubscriptionUpsertFields): Promise<void> {
    this.upserts.push({ artisanId, fields });
  }
  async applyDeleted(artisanId: number, fields: { plan: string; status: string; cancelAtPeriodEnd: boolean }): Promise<void> {
    this.deletes.push({ artisanId, plan: fields.plan, status: fields.status });
  }
  async setStatusAndPeriod(artisanId: number, fields: { status: string; currentPeriodStart: Date | null; currentPeriodEnd: Date | null }): Promise<void> {
    this.statusAndPeriods.push({ artisanId, status: fields.status, currentPeriodEnd: fields.currentPeriodEnd });
  }
  async setStatus(artisanId: number, status: string): Promise<void> {
    this.statuses.push({ artisanId, status });
  }
}
