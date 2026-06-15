import { createTRPCReact } from "@trpc/react-query";
// Le client est servi par le nouveau stack (Fastify + tRPC 11). Le type `AppRouter` est
// désormais celui du routeur clean-archi (`src/interface/trpc/router`) — le routeur legacy
// `server/routers.ts` n'est plus en exécution et sera supprimé (extinction du legacy).
import type { AppRouter } from "../../../src/interface/trpc/router";

export const trpc = createTRPCReact<AppRouter>();
