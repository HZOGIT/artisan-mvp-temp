import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../../apps/api/interface/trpc/router";

// Instance unique du client tRPC du front (clean-archi). Montée dans `main.tsx` (trpc.Provider) et consommée
// partout via `@/shared/trpc`. Type `AppRouter` = routeur serveur clean-archi (source de vérité unique).
export const trpc = createTRPCReact<AppRouter>();
