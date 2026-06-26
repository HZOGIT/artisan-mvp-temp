import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { registerRumVitalsRoute, sanitizeMetricValue } from "./rum-vitals-route";

const allow: RateLimiterPort = { check: async () => true };
const deny: RateLimiterPort = { check: async () => false };

async function buildTestApp(rateLimiter: RateLimiterPort, logs: string[]) {
  const app = Fastify();
  registerRumVitalsRoute(app, { rateLimiter, log: (l) => logs.push(l) });
  await app.ready();
  return app;
}

const post = (app: Awaited<ReturnType<typeof buildTestApp>>, payload: unknown) =>
  app.inject({ method: "POST", url: "/api/vitals", payload: payload as object, headers: { "content-type": "application/json" } });

describe("registerRumVitalsRoute", () => {
  it("LCP valide → loggué ; toujours {ok:true}", async () => {
    const logs: string[] = [];
    const app = await buildTestApp(allow, logs);
    const res = await post(app, { name: "LCP", value: 1234.5, rating: "good", id: "v4-abc" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("[RUM] LCP");
    expect(logs[0]).toContain("rating=good");
    expect(logs[0]).toContain("id=v4-abc");
    await app.close();
  });

  it("throttle silencieux → {ok:true} sans log", async () => {
    const logs: string[] = [];
    const app = await buildTestApp(deny, logs);
    const res = await post(app, { name: "CLS", value: 0.05, rating: "good", id: "v4-xyz" });
    expect(res.json()).toEqual({ ok: true });
    expect(logs).toHaveLength(0);
    await app.close();
  });

  it("nom de métrique invalide → silencieux, {ok:true}", async () => {
    const logs: string[] = [];
    const app = await buildTestApp(allow, logs);
    await post(app, { name: "INVALID", value: 42, rating: "good", id: "id1" });
    expect(logs).toHaveLength(0);
    await app.close();
  });

  it("corps vide → {ok:true} sans planter", async () => {
    const app = await buildTestApp(allow, []);
    expect((await post(app, {})).json()).toEqual({ ok: true });
    await app.close();
  });

  it("toutes les métriques valides acceptées (CLS, FCP, INP, TTFB, JS_ERROR)", async () => {
    const logs: string[] = [];
    const app = await buildTestApp(allow, logs);
    for (const name of ["CLS", "FCP", "INP", "TTFB", "JS_ERROR"]) {
      await post(app, { name, value: 100, rating: "good", id: "id" });
    }
    expect(logs).toHaveLength(5);
    await app.close();
  });
});

describe("sanitizeMetricValue", () => {
  it("arrondit à 3 décimales et rejette les non-finis", () => {
    expect(sanitizeMetricValue(1234.5678)).toBe(1234.568);
    expect(sanitizeMetricValue(0.1)).toBe(0.1);
    expect(sanitizeMetricValue("abc")).toBeNull();
    expect(sanitizeMetricValue(Infinity)).toBeNull();
    expect(sanitizeMetricValue(NaN)).toBeNull();
  });
});
