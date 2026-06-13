import { router, publicProcedure } from "./trpc";

// Routeur racine du nouveau stack. Vide pour l'instant (hors `health`) ; les routeurs
// de domaines (phases 1-5) y seront montés au fur et à mesure, derrière le gateway/flag.
export const appRouter = router({
  health: publicProcedure.query(() => ({ status: "ok" as const })),
});

export type AppRouter = typeof appRouter;
