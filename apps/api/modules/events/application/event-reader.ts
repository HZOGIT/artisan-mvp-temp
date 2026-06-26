import type { TenantContext } from "../../../shared/tenant";
import type { EventLog } from "../domain/event";

export interface IEventReader {
  list(ctx: TenantContext, input: { page: number; type?: string }): Promise<{ items: EventLog[]; total: number }>;
}
