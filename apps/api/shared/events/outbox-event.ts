import { getDbHandle } from "../db";
import { eventOutbox } from "../../../../drizzle/schema.pg";
import type { TenantContext } from "../tenant";

export async function outboxEvent(
  ctx: TenantContext,
  event: { action: string; entityType: string; entityId: number; payload?: Record<string, unknown> },
): Promise<void> {
  await getDbHandle().db.insert(eventOutbox).values({
    artisanId: ctx.artisanId,
    userId: ctx.userId ?? null,
    entityType: event.entityType,
    entityId: event.entityId,
    action: event.action,
    payload: event.payload ?? null,
  });
}
