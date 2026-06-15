import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { SignJWT } from "jose";
import type { TenantResolver } from "../../shared/tenant";
import type { ArtisanReader, ArtisanInfo } from "../../shared/readers/contact-readers";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import type { ConseilsStatsReader } from "../../modules/conseils-ia/application/conseils-stats-reader";
import { AssistantReadToolRegistry } from "../../modules/assistant/application/assistant-tool-registry";
import { FakeAssistantThreadWriter } from "../../modules/assistant/infra/assistant-thread-writer-fake";
import { FakeLlmAgenticPort, type ScriptedTurn } from "../../modules/assistant/infra/llm-agentic-fake";
import { registerAssistantAgentRoute } from "./assistant-agent-route";

const SECRET = "test-secret-at-least-32-characters-long-agent!";
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

async function buildTestApp(script: ScriptedTurn[]) {
  const app = Fastify();
  await app.register(cookie);
  // registry avec une lecture câblée (lister_factures) pour observer un toolCall.
  const registry = new AssistantReadToolRegistry({ lister_factures: async () => ({ ok: true, data: { count: 0, factures: [] } }) });
  registerAssistantAgentRoute(app, {
    jwtSecret: SECRET,
    resolver,
    llm: new FakeLlmAgenticPort(script),
    registry,
    rateLimiter: allow,
    artisanReader: new FakeArtisan(),
    statsReader: stats,
    threadWriter: new FakeAssistantThreadWriter(),
  });
  await app.ready();
  return app;
}

describe("registerAssistantAgentRoute (SSE agentique)", () => {
  it("sans cookie → 401", async () => {
    const app = await buildTestApp([{ text: ["x"] }]);
    const res = await app.inject({ method: "POST", url: "/api/assistant/stream", headers: { "content-type": "application/json" }, payload: JSON.stringify({ message: "salut" }) });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("message vide → 400", async () => {
    const app = await buildTestApp([{ text: ["x"] }]);
    const token = await sign(7);
    const res = await app.inject({ method: "POST", url: "/api/assistant/stream", headers: { "content-type": "application/json", cookie: `token=${token}` }, payload: JSON.stringify({ message: "" }) });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("message valide → 200 SSE : threadId + content + toolCall (1 outil exécuté) + content final", async () => {
    const app = await buildTestApp([
      { text: ["Je regarde."], calls: [{ name: "lister_factures", args: {} }] },
      { text: ["Tu as 0 facture."] },
    ]);
    const token = await sign(7);
    const res = await app.inject({ method: "POST", url: "/api/assistant/stream", headers: { "content-type": "application/json", cookie: `token=${token}` }, payload: JSON.stringify({ message: "mes factures ?" }) });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain('data: {"content":"Je regarde."}');
    expect(res.body).toContain('"toolCall":{"name":"lister_factures"');
    expect(res.body).toContain('data: {"content":"Tu as 0 facture."}');
    await app.close();
  });
});
