import Fastify, { type FastifyInstance } from "fastify";

// Construit l'instance Fastify du nouveau stack. Squelette : seule la route /health
// est exposée pour l'instant ; l'adapter tRPC et les routes des domaines (phases 1-5)
// seront enregistrés ici, derrière le gateway/feature-flags.
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
