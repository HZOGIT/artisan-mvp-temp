import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { SignJWT } from "jose";
import type { TenantResolver } from "../../shared/tenant";
import type { ArtisanReader, ArtisanInfo } from "../../shared/readers/contact-readers";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import type { ConseilsStatsReader } from "../../modules/conseils-ia/application/conseils-stats-reader";
import { findTool } from "../../modules/assistant/domain/assistant-tools-catalog";
import { RealtimeTokenError, type RealtimeVoiceTokenPort, type VoiceTokenMinted } from "../../modules/assistant/application/voice-token-use-cases";
import { FakeAssistantThreadWriter } from "../../modules/assistant/infra/assistant-thread-writer-fake";
import { FakeAssistantThreadsRepository } from "../../modules/assistant/infra/assistant-threads-repository-fake";
import { FakeRealtimeVoiceTokenPort } from "../../modules/assistant/infra/realtime-voice-token-fake";
import { registerVoiceTokenRoute } from "./voice-token-route";

const SECRET = "test-secret-at-least-32-characters-long-vtok!!";
const sign = (userId: number) => new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const resolver: TenantResolver = { resolve: async (claims) => ({ artisanId: 1, userId: claims.userId }) };
const artisan: ArtisanInfo = { id: 1, nomEntreprise: "Plomberie X", email: null, metier: "plomberie" };
class FakeArtisan implements ArtisanReader {
  async getArtisan(): Promise<ArtisanInfo | null> {
    return artisan;
  }
}
const stats: ConseilsStatsReader = { getStats: async () => ({ nbDevisEnAttente: 0, nbFacturesImpayees: 0, montantImpayees: 0, nbStocksBas: 0 }) };
const allow: RateLimiterPort = { check: async () => true };
const deny: RateLimiterPort = { check: async () => false };
const TOOLS = [findTool("lister_factures")!];

class ThrowingTokenPort implements RealtimeVoiceTokenPort {
  async mint(): Promise<VoiceTokenMinted> {
    throw new RealtimeTokenError("Gemini 503");
  }
}

async function buildTestApp(opts: { rateLimiter?: RateLimiterPort; tokenPort?: RealtimeVoiceTokenPort; checkSubscriptionActive?: (artisanId: number) => Promise<boolean> } = {}) {
  const app = Fastify();
  await app.register(cookie);
  registerVoiceTokenRoute(app, {
    jwtSecret: SECRET,
    resolver,
    tokenPort: opts.tokenPort ?? new FakeRealtimeVoiceTokenPort(),
    artisanReader: new FakeArtisan(),
    statsReader: stats,
    threadWriter: new FakeAssistantThreadWriter(),
    threadsRepo: new FakeAssistantThreadsRepository(),
    tools: TOOLS,
    rateLimiter: opts.rateLimiter ?? allow,
    checkSubscriptionActive: opts.checkSubscriptionActive ?? (async () => true),
  });
  await app.ready();
  return app;
}

const post = (app: Awaited<ReturnType<typeof buildTestApp>>, payload: object, token?: string) =>
  app.inject({ method: "POST", url: "/api/voice/token", headers: { "content-type": "application/json", ...(token ? { cookie: `token=${token}` } : {}) }, payload: JSON.stringify(payload) });

describe("registerVoiceTokenRoute", () => {
  it("sans cookie → 401", async () => {
    const app = await buildTestApp();
    expect((await post(app, {})).statusCode).toBe(401);
    await app.close();
  });

  it("rate-limit atteint → 429", async () => {
    const app = await buildTestApp({ rateLimiter: deny });
    expect((await post(app, {}, await sign(7))).statusCode).toBe(429);
    await app.close();
  });

  it("succès → 200 {token, wsUrl, model, expiresAt, threadId}", async () => {
    const app = await buildTestApp();
    const res = await post(app, {}, await sign(7));
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.token).toBe("tok-123");
    expect(j.wsUrl).toContain("wss://");
    expect(j.threadId).toBeGreaterThan(0);
    await app.close();
  });

  it("erreur provider → 502", async () => {
    const app = await buildTestApp({ tokenPort: new ThrowingTokenPort() });
    expect((await post(app, {}, await sign(7))).statusCode).toBe(502);
    await app.close();
  });

  it("abonnement inactif → 402 Abonnement requis", async () => {
    const app = await buildTestApp({ checkSubscriptionActive: async () => false });
    const res = await post(app, {}, await sign(7));
    expect(res.statusCode).toBe(402);
    expect(res.json().error).toBe("Abonnement requis");
    await app.close();
  });
});
