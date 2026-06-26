import { and, count, desc, eq } from "drizzle-orm";
import { eventLog } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IEventReader } from "../application/event-reader";

const PAGE_SIZE = 50;

export class EventReaderDrizzle implements IEventReader {
  constructor(private readonly db: DbClient) {}

  async list(ctx: TenantContext, input: { page: number; type?: string }) {
    const offset = (input.page - 1) * PAGE_SIZE;
    const filters = and(
      eq(eventLog.artisanId, ctx.artisanId),
      input.type !== undefined ? eq(eventLog.action, input.type) : undefined,
    );
    const [items, totals] = await Promise.all([
      this.db.select().from(eventLog).where(filters).orderBy(desc(eventLog.createdAt)).limit(PAGE_SIZE).offset(offset),
      this.db.select({ total: count() }).from(eventLog).where(filters),
    ]);
    return { items, total: Number(totals[0]?.total ?? 0) };
  }
}
