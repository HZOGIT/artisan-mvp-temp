import type { FastifyInstance } from "fastify";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import type { AssistantToolRegistry } from "../../modules/assistant/application/agentic-port";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface VoiceToolRouteDeps extends CookieAuthDeps {
  readonly registry: AssistantToolRegistry;
  readonly rateLimiter: RateLimiterPort;
}

/*
 * Route HORS-tRPC `POST /api/voice/tool` : exécute UN outil demandé par la session vocale Live (le
 * navigateur reçoit le `toolCall` Gemini, appelle ici avec le contexte tenant, renvoie le résultat à
 * Gemini). Auth cookie JWT + rate-limit IA (les outils d'envoi déclenchent des emails → borne anti-abus).
 * Parité legacy : renvoie `{ result: ToolResult }`. ⚠️ MONTÉ mais NON routé (legacy sert encore).
 */
export function registerVoiceToolRoute(app: FastifyInstance, deps: VoiceToolRouteDeps): void {
  app.post("/api/voice/tool", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non autorisé" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    if (!(await deps.rateLimiter.check(`ia:${auth.artisanId}`))) {
      return reply.code(429).send({ result: { ok: false, error: "Trop de requêtes. Réessayez dans un instant." } });
    }

    const body = (req.body ?? {}) as { name?: unknown; args?: unknown };
    if (!body.name || typeof body.name !== "string") return reply.code(400).send({ error: "name requis" });
    const args = (body.args && typeof body.args === "object" ? body.args : {}) as Record<string, unknown>;

    try {
      const result = await deps.registry.execute(body.name, args, { artisanId: auth.artisanId, userId: auth.userId });
      return reply.send({ result });
    } catch {
      return reply.send({ result: { ok: false, error: "Erreur exécution outil" } });
    }
  });
}
