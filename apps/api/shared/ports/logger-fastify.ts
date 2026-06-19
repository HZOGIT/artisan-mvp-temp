import type { PinoLoggerOptions } from "fastify/types/logger";

const SERVICE_BASE = {
  service: "operioz-api",
  env: process.env.NODE_ENV ?? "development",
  pid: process.pid,
  node: process.version,
};

/*
 * Serializers pino : on expose uniquement les champs utiles, sans cookies ni headers d'auth.
 * `responseTime` est ajouté automatiquement par Fastify sur le log "request completed".
 */
const SERIALIZERS: PinoLoggerOptions["serializers"] = {
  req(req: { method: string; url: string; hostname?: string }) {
    return {
      method: req.method,
      url: req.url,
      hostname: req.hostname,
    };
  },
  res(res: { statusCode: number }) {
    return { statusCode: res.statusCode };
  },
};

/**
 * Factory Fastify logger — retourne les options pino à passer à `Fastify({ logger })`.
 * BetterStack est un transport parmi d'autres : activé si BETTERSTACK_TOKEN est défini,
 * sinon pino standard sur stdout. Désactivé en test (NODE_ENV=test).
 */
export function buildFastifyLoggerConfig(): PinoLoggerOptions | false {
  if (process.env.NODE_ENV === "test") return false;

  const level = process.env.NODE_ENV === "production" ? "info" : "debug";
  const token = process.env.BETTERSTACK_TOKEN;

  const common: PinoLoggerOptions = {
    level,
    base: SERVICE_BASE,
    serializers: SERIALIZERS,
    redact: ["req.headers.authorization", "req.headers.cookie"],
  };

  if (token) {
    return {
      ...common,
      transport: {
        target: "@logtail/pino",
        options: { sourceToken: token },
      },
    };
  }

  return common;
}
