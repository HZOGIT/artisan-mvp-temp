import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createAppRouter } from "./interface/trpc/router";
import { makeCreateContext, type ContextDeps } from "./interface/trpc/context";
import { getDbHandle } from "./shared/db";
import { VehiculeRepositoryDrizzle } from "./modules/vehicules/infra/vehicule-repository-drizzle";
import type { IVehiculeRepository } from "./modules/vehicules/application/vehicule-repository";

export interface AppDeps extends ContextDeps {
  // Repos injectables (tests). Par défaut, repos Drizzle sur le client par défaut
  // (APP_DATABASE_URL → rôle app non-superuser soumis à la RLS).
  readonly vehiculeRepo?: IVehiculeRepository;
}

// Construit l'instance Fastify du nouveau stack : /health + tRPC monté sur /api/trpc.
export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cookie);

  app.get("/health", async () => ({ status: "ok" }));

  const vehiculeRepo = deps.vehiculeRepo ?? new VehiculeRepositoryDrizzle(getDbHandle().db);
  const appRouter = createAppRouter({ vehiculeRepo });

  app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: makeCreateContext({ jwtSecret: deps.jwtSecret, resolver: deps.resolver }),
    },
  });

  return app;
}
