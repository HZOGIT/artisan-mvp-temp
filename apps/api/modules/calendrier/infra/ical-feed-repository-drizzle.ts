import { eq } from "drizzle-orm";
import { artisans } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IIcalFeedRepository } from "../application/ical-feed-repository";

/*
 * ⚠️ `artisans` = table d'IDENTITÉ (hors RLS tenant) : scope par `id = ctx.artisanId` (jamais un
 * userId arbitraire). app_tenant a SELECT/UPDATE sur cette table.
 */
export class IcalFeedRepositoryDrizzle implements IIcalFeedRepository {
  constructor(private readonly db: DbClient) {}

  async getToken(ctx: TenantContext): Promise<string | null> {
    const [row] = await this.db
      .select({ icalToken: artisans.icalToken })
      .from(artisans)
      .where(eq(artisans.id, ctx.artisanId))
      .limit(1);
    return row?.icalToken ?? null;
  }

  async setToken(ctx: TenantContext, token: string): Promise<void> {
    await this.db.update(artisans).set({ icalToken: token }).where(eq(artisans.id, ctx.artisanId));
  }
}
