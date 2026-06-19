import type { TenantContext } from "../../../shared/tenant";
import type { IIcalFeedRepository } from "../application/ical-feed-repository";

/** Fake in-memory déterministe : jeton iCal par tenant. */
export class FakeIcalFeedRepository implements IIcalFeedRepository {
  private readonly tokens = new Map<number, string>();

  seedToken(artisanId: number, token: string): void {
    this.tokens.set(artisanId, token);
  }

  async getToken(ctx: TenantContext): Promise<string | null> {
    return this.tokens.get(ctx.artisanId) ?? null;
  }

  async setToken(ctx: TenantContext, token: string): Promise<void> {
    this.tokens.set(ctx.artisanId, token);
  }
}
