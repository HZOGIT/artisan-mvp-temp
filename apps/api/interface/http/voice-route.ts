import type { FastifyInstance } from "fastify";
import type { VoicePersistDeps } from "../../modules/assistant/application/voice-use-cases";
import { persistVoiceTranscript } from "../../modules/assistant/application/voice-use-cases";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface VoiceRouteDeps extends CookieAuthDeps, VoicePersistDeps {
  readonly checkSubscriptionActive: (artisanId: number) => Promise<boolean>;
}

/*
 * Route HORS-tRPC `POST /api/voice/persist` (auth cookie JWT) : persiste les transcripts d'une session
 * vocale (MonAssistant Live) dans un thread du tenant. Anti-IDOR via l'ownership du thread.
 */
export function registerVoiceRoute(app: FastifyInstance, deps: VoiceRouteDeps): void {
  app.post("/api/voice/persist", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non autorisé" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });
    if (!(await deps.checkSubscriptionActive(auth.artisanId))) return reply.code(402).send({ error: "Abonnement requis" });

    const body = (req.body ?? {}) as { threadId?: unknown; userTranscript?: unknown; assistantTranscript?: unknown; usageMetadata?: unknown };
    const input = {
      threadId: Number(body.threadId) || 0,
      userTranscript: typeof body.userTranscript === "string" ? body.userTranscript : undefined,
      assistantTranscript: typeof body.assistantTranscript === "string" ? body.assistantTranscript : undefined,
      usageMetadata: body.usageMetadata,
    };

    let outcome;
    try {
      outcome = await persistVoiceTranscript(deps, { artisanId: auth.artisanId, userId: auth.userId }, input);
    } catch (e) {
      req.log.error({ event: "voice_persist_error", err: e instanceof Error ? e : new Error(String(e)), artisanId: auth.artisanId }, "Erreur persistence transcript vocal");
      return reply.code(500).send({ error: "Erreur serveur" });
    }
    switch (outcome.kind) {
      case "bad-request":
        return reply.code(400).send({ error: "threadId + transcript requis" });
      case "not-found":
        return reply.code(404).send({ error: "Thread introuvable" });
      case "ok":
        req.log.info({ event: "voice_transcript_persisted", artisanId: auth.artisanId, threadId: input.threadId, hasUserTranscript: !!input.userTranscript, hasAssistantTranscript: !!input.assistantTranscript }, "Transcript vocal persisté");
        return reply.send({ ok: true });
    }
  });
}
