import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createAppRouter } from "./interface/trpc/router";
import { makeCreateContext, type ContextDeps } from "./interface/trpc/context";
import { getDbHandle } from "./shared/db";
import { VehiculeRepositoryDrizzle } from "./modules/vehicules/infra/vehicule-repository-drizzle";
import type { IVehiculeRepository } from "./modules/vehicules/application/vehicule-repository";
import { AvisRepositoryDrizzle } from "./modules/avis/infra/avis-repository-drizzle";
import type { IAvisRepository } from "./modules/avis/application/avis-repository";
import { DemandeAvisRepositoryDrizzle } from "./modules/avis/infra/demande-avis-repository-drizzle";
import type { IDemandeAvisRepository } from "./modules/avis/application/demande-avis-repository";
import type { EmailPort, RateLimiterPort } from "./shared/ports";
import { LegacyEmailAdapter, SlidingWindowRateLimiter } from "./shared/ports";

export interface AppDeps extends ContextDeps {
  // Repos injectables (tests). Par défaut, repos Drizzle sur le client par défaut
  // (APP_DATABASE_URL → rôle app non-superuser soumis à la RLS).
  readonly vehiculeRepo?: IVehiculeRepository;
  readonly avisRepo?: IAvisRepository;
  // Dépendances du workflow demande d'avis (injectables en test : email/rate-limiter fakes).
  readonly demandeAvisRepo?: IDemandeAvisRepository;
  readonly emailPort?: EmailPort;
  readonly rateLimiter?: RateLimiterPort;
  readonly lienBaseUrl?: string;
}

// Construit l'instance Fastify du nouveau stack : /health + tRPC monté sur /api/trpc.
export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cookie);

  app.get("/health", async () => ({ status: "ok" }));

  const vehiculeRepo = deps.vehiculeRepo ?? new VehiculeRepositoryDrizzle(getDbHandle().db);
  const avisRepo = deps.avisRepo ?? new AvisRepositoryDrizzle(getDbHandle().db);
  const demandeAvisDeps = {
    repo: deps.demandeAvisRepo ?? new DemandeAvisRepositoryDrizzle(getDbHandle().db),
    email: deps.emailPort ?? new LegacyEmailAdapter(),
    rateLimiter: deps.rateLimiter ?? new SlidingWindowRateLimiter(),
    lienBaseUrl: deps.lienBaseUrl ?? process.env.APP_URL ?? "https://www.operioz.com",
  };
  const appRouter = createAppRouter({ vehiculeRepo, avisRepo, demandeAvisDeps });

  app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: makeCreateContext({ jwtSecret: deps.jwtSecret, resolver: deps.resolver }),
    },
  });

  return app;
}
