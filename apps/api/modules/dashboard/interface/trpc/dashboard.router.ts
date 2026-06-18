import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IDashboardReader } from "../../application/dashboard-reader";
import * as uc from "../../application/use-cases";

// Routeur tRPC du dashboard (10 lectures agrégées du tenant). Surface client complète. Lecture seule.
export function createDashboardRouter(reader: IDashboardReader) {
  return router({
    getStats: protectedProcedure.query(({ ctx }) => uc.getStats(reader, ctx.tenant)),

    getRecentActivity: protectedProcedure
      .input(z.object({ limit: z.number().max(500).optional() }).optional())
      .query(({ ctx, input }) => uc.getRecentActivity(reader, ctx.tenant, input?.limit ?? 10)),

    getUpcomingInterventions: protectedProcedure.query(({ ctx }) => uc.getUpcomingInterventions(reader, ctx.tenant)),

    getMonthlyCA: protectedProcedure
      .input(z.object({ months: z.number().optional() }).optional())
      .query(({ ctx, input }) => uc.getMonthlyCA(reader, ctx.tenant, input?.months ?? 12)),

    getYearlyComparison: protectedProcedure.query(({ ctx }) => uc.getYearlyComparison(reader, ctx.tenant)),

    getConversionRate: protectedProcedure.query(({ ctx }) => uc.getConversionRate(reader, ctx.tenant)),

    getTopClients: protectedProcedure
      .input(z.object({ limit: z.number().max(500).optional() }).optional())
      .query(({ ctx, input }) => uc.getTopClients(reader, ctx.tenant, input?.limit ?? 5)),

    getClientEvolution: protectedProcedure
      .input(z.object({ months: z.number().optional() }).optional())
      .query(({ ctx, input }) => uc.getClientEvolution(reader, ctx.tenant, input?.months ?? 12)),

    getObjectifs: protectedProcedure.query(({ ctx }) => uc.getObjectifs(reader, ctx.tenant)),

    getAlerts: protectedProcedure.query(({ ctx }) => uc.getAlerts(reader, ctx.tenant)),
  });
}
