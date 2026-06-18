import type { FastifyInstance } from "fastify";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { mintVoiceToken, RealtimeTokenError, type VoiceTokenDeps } from "../../modules/assistant/application/voice-token-use-cases";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface VoiceTokenRouteDeps extends CookieAuthDeps, VoiceTokenDeps {
  readonly rateLimiter: RateLimiterPort;
}

// Route HORS-tRPC `POST /api/voice/token` : mint d'un token éphémère pour la session vocale Live (auth
// cookie JWT + rate-limit IA). Renvoie `{token, wsUrl, model, expiresAt, threadId}`. Erreur provider →
// 502 (parité legacy). ⚠️ MONTÉ mais NON routé (legacy sert encore).
export function registerVoiceTokenRoute(app: FastifyInstance, deps: VoiceTokenRouteDeps): void {
  app.post("/api/voice/token", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non autorisé" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    if (!(await deps.rateLimiter.check(`ia:${auth.artisanId}`))) {
      return reply.code(429).send({ error: "Trop de requêtes. Réessayez dans un instant." });
    }

    const body = (req.body ?? {}) as { threadId?: unknown; pageContext?: unknown };
    const input = {
      threadId: typeof body.threadId === "number" ? body.threadId : undefined,
      pageContext: typeof body.pageContext === "string" ? body.pageContext : undefined,
    };

    try {
      const out = await mintVoiceToken(deps, { artisanId: auth.artisanId, userId: auth.userId }, input);
      return reply.send(out);
    } catch (e) {
      if (e instanceof RealtimeTokenError) return reply.code(502).send({ error: "Impossible de créer le token vocal" });
      return reply.code(500).send({ error: "Erreur serveur" });
    }
  });
}
