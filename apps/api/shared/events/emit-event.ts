import type { EventBusPort } from "../ports/event-bus";
import type { TenantContext } from "../tenant";

export function emitEvent(
  eventBus: EventBusPort,
  ctx: TenantContext,
  event: { type: string; entityType: string; entityId: number; payload?: Record<string, unknown> },
): void {
  void eventBus.publish({
    type: event.type,
    aggregateType: event.entityType,
    aggregateId: event.entityId,
    artisanId: ctx.artisanId,
    userId: ctx.userId ?? null,
    occurredAt: new Date(),
    payload: event.payload,
  });
}
