import type { FastifyInstance } from "fastify";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { extractClientIp } from "./client-ip";

export interface RumVitalsDeps {
  readonly rateLimiter: RateLimiterPort;
  /** Sink de log (injectable pour les tests). Défaut : console.warn. */
  readonly log?: (line: string) => void;
}

/** Noms de métriques Web Vitals et erreurs JS acceptés. */
const VALID_METRIC_NAMES = new Set(["CLS", "FCP", "INP", "LCP", "TTFB", "JS_ERROR"]);

/** Sanitise une valeur numérique (retourne null si invalide). PUR. */
export function sanitizeMetricValue(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

/*
 * Route HORS-tRPC `POST /api/vitals` : collecte RUM fire-and-forget envoyée
 * par `navigator.sendBeacon` côté client (PUBLIC, sans auth). Anti-flood par IP (30/min,
 * throttle silencieux). Loggue les métriques Web Vitals (LCP, CLS, INP, FCP, TTFB)
 * et erreurs JS. Renvoie TOUJOURS {ok:true} (best-effort).
 */
export function registerRumVitalsRoute(app: FastifyInstance, deps: RumVitalsDeps): void {
  const log = deps.log ?? ((line: string) => console.warn(line));
  app.post("/api/vitals", async (req, reply) => {
    try {
      const ip = extractClientIp((req.headers ?? {}) as Record<string, unknown>, req.ip ?? null);
      if (!(await deps.rateLimiter.check(`rum-vitals:${ip}`))) return reply.send({ ok: true });
      const body = (req.body ?? {}) as { name?: unknown; value?: unknown; rating?: unknown; id?: unknown };
      const name = typeof body.name === "string" ? body.name.toUpperCase() : null;
      if (!name || !VALID_METRIC_NAMES.has(name)) return reply.send({ ok: true });
      const value = sanitizeMetricValue(body.value);
      const strip = (s: string) => s.replace(/[\r\n\t\x00-\x1f]/g, "");
      const rating = typeof body.rating === "string" ? strip(body.rating).slice(0, 20) : "unknown";
      const id = typeof body.id === "string" ? strip(body.id).slice(0, 64) : "-";
      log(`[RUM] ${name} value=${value ?? "?"} rating=${rating} id=${id}`);
    } catch {
      /* ponytail: best-effort — fire-and-forget, ne jamais échouer */
    }
    return reply.send({ ok: true });
  });
}
