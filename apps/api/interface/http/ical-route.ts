import type { FastifyInstance } from "fastify";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { buildIcalFeed } from "../../modules/calendrier/domain/ical";
import type { IcalPublicReader } from "../../modules/calendrier/application/ical-public-reader";
import { extractClientIp } from "./client-ip";

// Fenêtre legacy : interventions à partir d'il y a 90 jours.
const FENETRE_MS = 90 * 24 * 60 * 60 * 1000;

export interface IcalRouteDeps {
  readonly reader: IcalPublicReader;
  readonly rateLimiter: RateLimiterPort;
}

/*
 * Route PUBLIQUE hors tRPC `/api/calendar/:token.ics` (abonnement iCal des interventions). Le jeton
 * `icalToken` EST la capacité (pas de cookie tenant). Parité legacy : rate-limit IP, 404 si jeton
 * inconnu, réponse `text/calendar`. Lecture seule, scopée à l'artisan résolu par le jeton.
 */
export function registerIcalRoute(app: FastifyInstance, deps: IcalRouteDeps): void {
  app.get("/api/calendar/:token.ics", async (req, reply) => {
    const ip = extractClientIp((req.headers ?? {}) as Record<string, unknown>, req.ip ?? null);
    if (!(await deps.rateLimiter.check(`ical:${ip}`))) {
      return reply.code(429).type("text/plain").send("Trop de requêtes");
    }
    const token = String((req.params as { token?: string }).token ?? "").replace(/\.ics$/i, "");
    if (!token) return reply.code(404).type("text/plain").send("Calendrier introuvable");

    const since = new Date(Date.now() - FENETRE_MS);
    let feed;
    try {
      feed = await deps.reader.getFeedByToken(token, since);
    } catch {
      return reply.code(500).type("text/plain").send("Erreur de génération du calendrier");
    }
    if (!feed) return reply.code(404).type("text/plain").send("Calendrier introuvable");

    const ics = buildIcalFeed({ calName: feed.calName, events: feed.events });
    return reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Content-Disposition", 'inline; filename="operioz.ics"')
      .send(ics);
  });
}
