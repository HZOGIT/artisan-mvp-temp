import { z } from "zod";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { platformAdminProcedure, router } from "../../../../interface/trpc/trpc";
import { artisans, subscriptions, users, eventLog, llmUsage } from "../../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../../shared/db";

const PAGE_SIZE = 50;

export function createPlatformAdminRouter(db: DbClient) {
  return router({
    artisans: router({
      list: platformAdminProcedure
        .input(z.object({ page: z.number().int().min(1).optional().default(1) }))
        .query(async ({ input }) => {
          const offset = (input.page - 1) * PAGE_SIZE;
          const [items, totals] = await Promise.all([
            db
              .select({
                id: artisans.id,
                nomEntreprise: artisans.nomEntreprise,
                siret: artisans.siret,
                email: users.email,
                plan: artisans.plan,
                createdAt: artisans.createdAt,
              })
              .from(artisans)
              .leftJoin(users, eq(users.id, artisans.userId))
              .orderBy(desc(artisans.createdAt))
              .limit(PAGE_SIZE)
              .offset(offset),
            db.select({ total: count() }).from(artisans),
          ]);
          return { items, total: Number(totals[0]?.total ?? 0) };
        }),
    }),
    subscriptions: router({
      list: platformAdminProcedure
        .input(z.object({ page: z.number().int().min(1).optional().default(1) }))
        .query(async ({ input }) => {
          const offset = (input.page - 1) * PAGE_SIZE;
          const [items, totals] = await Promise.all([
            db
              .select({
                id: subscriptions.id,
                artisanId: subscriptions.artisan_id,
                nomEntreprise: artisans.nomEntreprise,
                plan: subscriptions.plan,
                status: subscriptions.status,
                trialEndsAt: subscriptions.trial_ends_at,
                currentPeriodEnd: subscriptions.current_period_end,
              })
              .from(subscriptions)
              .leftJoin(artisans, eq(artisans.id, subscriptions.artisan_id))
              .orderBy(desc(subscriptions.created_at))
              .limit(PAGE_SIZE)
              .offset(offset),
            db.select({ total: count() }).from(subscriptions),
          ]);
          return { items, total: Number(totals[0]?.total ?? 0) };
        }),
    }),
    events: router({
      list: platformAdminProcedure
        .input(z.object({
          page: z.number().int().min(1).optional().default(1),
          artisanId: z.number().int().optional(),
          type: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        }))
        .query(async ({ input }) => {
          const offset = (input.page - 1) * PAGE_SIZE;
          const filters = and(
            input.artisanId !== undefined ? eq(eventLog.artisanId, input.artisanId) : undefined,
            input.type !== undefined ? eq(eventLog.action, input.type) : undefined,
            input.from !== undefined ? gte(eventLog.createdAt, new Date(input.from)) : undefined,
            input.to !== undefined ? lte(eventLog.createdAt, new Date(input.to)) : undefined,
          );
          const [items, totals] = await Promise.all([
            db.select().from(eventLog).where(filters).orderBy(desc(eventLog.createdAt)).limit(PAGE_SIZE).offset(offset),
            db.select({ total: count() }).from(eventLog).where(filters),
          ]);
          return { items, total: Number(totals[0]?.total ?? 0) };
        }),
    }),
    llmUsage: router({
      summary: platformAdminProcedure
        .input(z.object({}))
        .query(async () => {
          const rows = await db
            .select({
              artisanId: llmUsage.artisanId,
              nomEntreprise: artisans.nomEntreprise,
              totalTokens: sql<number>`sum(${llmUsage.totalTokens})`,
              promptTokens: sql<number>`sum(${llmUsage.promptTokens})`,
              responseTokens: sql<number>`sum(${llmUsage.responseTokens})`,
              callCount: sql<number>`count(*)`,
            })
            .from(llmUsage)
            .leftJoin(artisans, eq(artisans.id, llmUsage.artisanId))
            .groupBy(llmUsage.artisanId, artisans.nomEntreprise)
            .orderBy(desc(sql`sum(${llmUsage.totalTokens})`));
          return rows;
        }),
    }),
  });
}
