import type { FastifyInstance } from "fastify";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { extractClientIp } from "./client-ip";

export interface VoiceDebugDeps {
  /** Anti-flood par IP (parité legacy : 30 / min, throttle SILENCIEUX). */
  readonly rateLimiter: RateLimiterPort;
  /** Sink de log (injectable pour les tests). Défaut : console.log. */
  readonly log?: (line: string) => void;
}

/** Sanitise une entrée de log (anti log-injection : retire CRLF/contrôle, tronque à 500). PUR. */
export function sanitizeLogLine(v: unknown): string {
  return String(typeof v === "string" ? v : JSON.stringify(v))
    .replace(/[\r\n\x00-\x1f]/g, " ")
    .slice(0, 500);
}

/*
 * Route HORS-tRPC `POST /api/voice/debug` (parité legacy) : télémétrie d'erreur fire-and-forget envoyée
 * par `navigator.sendBeacon` côté client (PUBLIC, sans auth). Anti-flood par IP (throttle silencieux →
 * {ok:true}). Loggue `events[]` (max 20) ou `msg`, sanitisés. Renvoie TOUJOURS {ok:true} (best-effort).
 */
export function registerVoiceDebugRoute(app: FastifyInstance, deps: VoiceDebugDeps): void {
  const log = deps.log ?? ((line: string) => console.warn(line));
  app.post("/api/voice/debug", async (req, reply) => {
    try {
      const ip = extractClientIp((req.headers ?? {}) as Record<string, unknown>, req.ip ?? null);
      /** throttle silencieux */
      if (!(await deps.rateLimiter.check(`voice-debug:${ip}`))) return reply.send({ ok: true });
      const body = (req.body ?? {}) as { events?: unknown; msg?: unknown };
      if (Array.isArray(body.events)) {
        for (const e of body.events.slice(0, 20)) log(`[VoiceDebug] ${sanitizeLogLine(e)}`);
      } else if (body.msg !== undefined && body.msg !== null) {
        log(`[VoiceDebug] ${sanitizeLogLine(body.msg)}`);
      }
    } catch {
      /* fire-and-forget : ne jamais échouer */
    }
    return reply.send({ ok: true });
  });
}
