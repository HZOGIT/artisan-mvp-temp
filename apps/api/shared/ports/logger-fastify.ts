import type { PinoLoggerOptions } from "fastify/types/logger";

/**
 * Factory Fastify logger — retourne les options pino à passer à `Fastify({ logger })`.
 * BetterStack est un transport parmi d'autres : activé si BETTERSTACK_TOKEN est défini,
 * sinon pino standard sur stdout. Désactivé en test (NODE_ENV=test).
 */
export function buildFastifyLoggerConfig(): PinoLoggerOptions | false {
  if (process.env.NODE_ENV === "test") return false;

  const level = process.env.NODE_ENV === "production" ? "info" : "debug";
  const token = process.env.BETTERSTACK_TOKEN;

  if (token) {
    return {
      transport: {
        target: "@logtail/pino",
        options: { sourceToken: token },
      },
      level,
      redact: ["req.headers.authorization", "req.headers.cookie"],
    };
  }

  return { level };
}
