import type { DbClient } from "../db";
import { eventOutbox } from "../../../../drizzle/schema.pg";
import type { TenantContext } from "../tenant";

/**
 * Insère un événement dans event_outbox via le client `db` fourni.
 * Passer une transaction Drizzle pour l'atomicité mutation+outbox.
 * Sans tx capable (repos actuels), passer getDbHandle().db — best-effort.
 */
export async function outboxEvent(
  db: DbClient,
  ctx: TenantContext,
  event: { action: string; entityType: string; entityId: number; payload?: Record<string, unknown> },
): Promise<void> {
  await db.insert(eventOutbox).values({
    artisanId: ctx.artisanId,
    userId: ctx.userId ?? null,
    entityType: event.entityType,
    entityId: event.entityId,
    action: event.action,
    payload: event.payload ?? null,
  });
}
