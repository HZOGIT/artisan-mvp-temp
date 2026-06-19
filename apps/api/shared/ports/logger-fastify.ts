import os from "node:os";
import type { PinoLoggerOptions } from "fastify/types/logger";

/**
 * Contexte figé au démarrage : identifie le conteneur/réplica dans BetterStack.
 * `hostname` = container ID en Docker, pod name en Kubernetes — crucial en multi-réplicas.
 */
const SERVICE_BASE = {
  service: "operioz-api",
  env: process.env.NODE_ENV ?? "development",
  hostname: os.hostname(),
  pid: process.pid,
  nodeVersion: process.version,
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
  /**
   * Clé conventionnelle `err` → { type, message, stack, code?, statusCode?, cause? }.
   * `code` = code pg (ex. "23505") ou node:fs/axios (ex. "ECONNREFUSED") — filtrable dans BetterStack.
   * `statusCode` = code HTTP (http-errors, undici).
   * `cause` = Error.cause (Node 16+, une profondeur) — debug des erreurs wrappées.
   */
  err(e: unknown) {
    if (!(e instanceof Error)) return e;
    const base: Record<string, unknown> = { type: e.name, message: e.message, stack: e.stack };
    const typed = e as unknown as Record<string, unknown>;
    if (typeof typed.code === "string") base.code = typed.code;
    if (typeof typed.statusCode === "number") base.statusCode = typed.statusCode;
    if (e.cause != null) {
      base.cause = e.cause instanceof Error
        ? { type: (e.cause as Error).name, message: (e.cause as Error).message }
        : String(e.cause);
    }
    return base;
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
