import { z } from "zod";
import { and, count, desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../../../../interface/trpc/trpc";
import { eventLog } from "../../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../../shared/db";

const PAGE_SIZE = 50;

export function createEventsRouter(db: DbClient) {
  return router({
    list: protectedProcedure
      .input(z.object({
        page: z.number().int().min(1).optional().default(1),
        type: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const offset = (input.page - 1) * PAGE_SIZE;
        const filters = and(
          eq(eventLog.artisanId, ctx.tenant.artisanId),
          input.type !== undefined ? eq(eventLog.action, input.type) : undefined,
        );
        const [items, totals] = await Promise.all([
          db.select().from(eventLog).where(filters).orderBy(desc(eventLog.createdAt)).limit(PAGE_SIZE).offset(offset),
          db.select({ total: count() }).from(eventLog).where(filters),
        ]);
        return { items, total: Number(totals[0]?.total ?? 0) };
      }),
  });
}
