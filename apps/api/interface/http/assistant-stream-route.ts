import type { FastifyInstance } from "fastify";
import { TooManyRequestsError, ValidationError } from "../../shared/errors";
import type { AssistantStreamDeps } from "../../modules/assistant/application/stream-use-cases";
import { streamAssistantReply } from "../../modules/assistant/application/stream-use-cases";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface AssistantStreamRouteDeps extends CookieAuthDeps, AssistantStreamDeps {}

/*
 * Route HORS-tRPC `POST /api/assistant/stream` (SSE) : chat assistant en streaming, auth cookie JWT.
 * Émet `data: {threadId}` puis `data: {content}` par fragment (parité legacy). Le dispatcher edge est
 * streaming-safe (pipe). ⚠️ Mode TEXT only — le mode AGENTIQUE (outils) reste sur le legacy (non routé).
 */
export function registerAssistantStreamRoute(app: FastifyInstance, deps: AssistantStreamRouteDeps): void {
  app.post("/api/assistant/stream", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non autorisé" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    const body = (req.body ?? {}) as { message?: unknown; history?: unknown; pageContext?: unknown; threadId?: unknown };
    const input = {
      message: typeof body.message === "string" ? body.message : "",
      history: Array.isArray(body.history) ? (body.history as { role: string; content: string }[]) : [],
      pageContext: typeof body.pageContext === "string" ? body.pageContext : undefined,
      threadId: typeof body.threadId === "number" ? body.threadId : undefined,
    };

    const gen = streamAssistantReply(deps, { artisanId: auth.artisanId, userId: auth.userId }, input);

    /** 1er tick : les erreurs de validation/rate-limit sont levées AVANT tout stream → mappées en JSON. */
    let first: IteratorResult<{ threadId: number } | { content: string }>;
    try {
      first = await gen.next();
    } catch (e) {
      if (e instanceof ValidationError) return reply.code(400).send({ error: e.message });
      if (e instanceof TooManyRequestsError) return reply.code(429).send({ error: e.message });
      return reply.code(500).send({ error: "Erreur serveur" });
    }

    /** À partir d'ici : flux SSE. On détache la réponse de Fastify (`hijack`) et on écrit le brut. */
    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const send = (ev: unknown): void => {
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    };
    let aborted = false;
    req.raw.on("close", () => {
      aborted = true;
    });

    try {
      if (!first.done) send(first.value);
      for await (const ev of gen) {
        if (aborted) break;
        send(ev);
      }
    } catch {
      /* erreur en cours de stream : best-effort, on clôt proprement */
    }
    reply.raw.end();
  });
}
