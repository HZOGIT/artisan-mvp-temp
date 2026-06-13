import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./interface/trpc/router";
import { makeCreateContext, type ContextDeps } from "./interface/trpc/context";

// Construit l'instance Fastify du nouveau stack : route /health + tRPC monté sur
// /api/trpc (appRouter pour l'instant réduit à `health`). Les routeurs de domaines
// (phases 1-5) seront ajoutés à appRouter, derrière le gateway/feature-flags.
export function buildApp(deps: ContextDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cookie);

  app.get("/health", async () => ({ status: "ok" }));

  app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: { router: appRouter, createContext: makeCreateContext(deps) },
  });

  return app;
}
