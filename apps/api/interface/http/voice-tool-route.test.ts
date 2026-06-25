import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { SignJWT } from "jose";
import type { TenantResolver } from "../../shared/tenant";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { AssistantReadToolRegistry } from "../../modules/assistant/application/assistant-tool-registry";
import { registerVoiceToolRoute } from "./voice-tool-route";

const SECRET = "test-secret-at-least-32-characters-long-vtool!";
const sign = (userId: number) => new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const resolver: TenantResolver = { resolve: async (claims) => ({ artisanId: 1, userId: claims.userId }) };
const allow: RateLimiterPort = { check: async () => true };
const deny: RateLimiterPort = { check: async () => false };

async function buildTestApp(rateLimiter: RateLimiterPort = allow, checkSubscriptionActive = async () => true) {
  const app = Fastify();
  await app.register(cookie);
  const registry = new AssistantReadToolRegistry({ lister_factures: async () => ({ ok: true, data: { count: 3 } }) });
  registerVoiceToolRoute(app, { jwtSecret: SECRET, resolver, registry, rateLimiter, checkSubscriptionActive });
  await app.ready();
  return app;
}

const post = (app: Awaited<ReturnType<typeof buildTestApp>>, payload: object, token?: string) =>
  app.inject({ method: "POST", url: "/api/voice/tool", headers: { "content-type": "application/json", ...(token ? { cookie: `token=${token}` } : {}) }, payload: JSON.stringify(payload) });

describe("registerVoiceToolRoute", () => {
  it("sans cookie → 401", async () => {
    const app = await buildTestApp();
    expect((await post(app, { name: "lister_factures" })).statusCode).toBe(401);
    await app.close();
  });

  it("name manquant → 400", async () => {
    const app = await buildTestApp();
    const token = await sign(7);
    expect((await post(app, {}, token)).statusCode).toBe(400);
    await app.close();
  });

  it("rate-limit atteint → 429 {result:{ok:false}}", async () => {
    const app = await buildTestApp(deny);
    const token = await sign(7);
    const res = await post(app, { name: "lister_factures" }, token);
    expect(res.statusCode).toBe(429);
    expect(res.json().result.ok).toBe(false);
    await app.close();
  });

  it("outil de lecture → 200 {result:{ok:true,data}}", async () => {
    const app = await buildTestApp();
    const token = await sign(7);
    const res = await post(app, { name: "lister_factures", args: {} }, token);
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toEqual({ ok: true, data: { count: 3 } });
    await app.close();
  });

  it("écriture (registry lecture seule) → 200 {result:{ok:false}} (refus, jamais d'exception)", async () => {
    const app = await buildTestApp();
    const token = await sign(7);
    const res = await post(app, { name: "creer_client", args: { nom: "X" } }, token);
    expect(res.statusCode).toBe(200);
    expect(res.json().result.ok).toBe(false);
    await app.close();
  });

  it("abonnement inactif → 402 Abonnement requis", async () => {
    const app = await buildTestApp(allow, async () => false);
    const token = await sign(7);
    const res = await post(app, { name: "lister_factures" }, token);
    expect(res.statusCode).toBe(402);
    expect(res.json().error).toBe("Abonnement requis");
    await app.close();
  });
});
