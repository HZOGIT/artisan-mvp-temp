import { router, publicProcedure, protectedProcedure } from "./trpc";

// Routeur racine du nouveau stack. Les routeurs de domaines (phases 1-5) y seront montés
// au fur et à mesure, derrière le gateway/flag. `whoami` démontre `protectedProcedure`
// (exige un TenantContext résolu).
export const appRouter = router({
  health: publicProcedure.query(() => ({ status: "ok" as const })),
  whoami: protectedProcedure.query(({ ctx }) => ({
    artisanId: ctx.tenant.artisanId,
    userId: ctx.tenant.userId,
    role: ctx.tenant.role ?? null,
  })),
});

export type AppRouter = typeof appRouter;
