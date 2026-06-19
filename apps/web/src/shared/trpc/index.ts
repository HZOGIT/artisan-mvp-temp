import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../apps/api/interface/trpc/router";

/*
 * Couture tRPC du FRONT NEUF (clean-archi). Les features `modern/**` consomment le **même** client
 * tRPC que le legacy — l'instance unique créée dans `client/src/lib/trpc.ts` et montée dans `main.tsx`
 * via `trpc.Provider` (donc QueryClient + auth cookie + superjson **partagés**). On la réexpose ici
 * pour que la couche application du neuf ne dépende QUE de `modern/shared/trpc` (et jamais de REST :
 * la refonte conserve tRPC, cf. mission). Aucun second provider, aucun client dupliqué.
 */
export { trpc } from "./client";

/*
 * Types utilitaires inférés depuis le routeur serveur : source de vérité unique end-to-end pour les
 * types de domaine du front (ex. `RouterOutputs["clients"]["list"][number]`).
 */
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
