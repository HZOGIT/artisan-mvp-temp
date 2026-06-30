import { eq } from "drizzle-orm";
import { artisans, eventOutbox } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { ConnectArtisanWriter } from "../application/connect-artisan-writer";
import { deriveConnectStatus } from "../domain/connect";

/** Implémentation Drizzle de ConnectArtisanWriter. Requiert le pool owner (cross-tenant sur artisans). */
export class ConnectArtisanWriterDrizzle implements ConnectArtisanWriter {
  constructor(private readonly ownerDb: DbClient) {}

  async upsertConnectStatus(accountId: string, obj: Record<string, unknown>): Promise<void> {
    const chargesEnabled = Boolean(obj["charges_enabled"]);
    const payoutsEnabled = Boolean(obj["payouts_enabled"]);
    const detailsSubmitted = Boolean(obj["details_submitted"]);
    const requirements = (obj["requirements"] as Record<string, unknown> | null) ?? null;
    const now = new Date();

    await this.ownerDb.transaction(async (tx) => {
      const [updated] = await tx.update(artisans)
        .set({
          stripeConnectChargesEnabled: chargesEnabled,
          stripeConnectPayoutsEnabled: payoutsEnabled,
          stripeConnectDetailsSubmitted: detailsSubmitted,
          stripeConnectRequirements: requirements,
          stripeConnectStatus: deriveConnectStatus(chargesEnabled, detailsSubmitted),
          stripeConnectUpdatedAt: now,
          ...(chargesEnabled ? { stripeConnectConnectedAt: now } : {}),
        })
        .where(eq(artisans.stripeConnectAccountId, accountId))
        .returning({ id: artisans.id });

      if (updated) {
        await tx.insert(eventOutbox).values({
          artisanId: updated.id,
          userId: null,
          entityType: "compte_connecte",
          entityId: updated.id,
          action: "compte_connecte.maj",
          payload: { accountId, chargesEnabled, payoutsEnabled, detailsSubmitted },
        });
      }
    });
  }

  async resetConnectStatus(accountId: string): Promise<void> {
    await this.ownerDb.transaction(async (tx) => {
      const [updated] = await tx.update(artisans)
        .set({
          stripeConnectChargesEnabled: false,
          stripeConnectPayoutsEnabled: false,
          stripeConnectStatus: "deauthorized",
          stripeConnectUpdatedAt: new Date(),
        })
        .where(eq(artisans.stripeConnectAccountId, accountId))
        .returning({ id: artisans.id });

      if (updated) {
        await tx.insert(eventOutbox).values({
          artisanId: updated.id,
          userId: null,
          entityType: "compte_connecte",
          entityId: updated.id,
          action: "compte_connecte.deconnecte",
          payload: { accountId },
        });
      }
    });
  }
}
