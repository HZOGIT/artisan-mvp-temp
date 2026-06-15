import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { registerVoiceDebugRoute, sanitizeLogLine } from "./voice-debug-route";

const allow: RateLimiterPort = { check: async () => true };
const deny: RateLimiterPort = { check: async () => false };

async function buildTestApp(rateLimiter: RateLimiterPort, logs: string[]) {
  const app = Fastify();
  registerVoiceDebugRoute(app, { rateLimiter, log: (l) => logs.push(l) });
  await app.ready();
  return app;
}

const post = (app: Awaited<ReturnType<typeof buildTestApp>>, payload: unknown) =>
  app.inject({ method: "POST", url: "/api/voice/debug", payload: payload as object, headers: { "content-type": "application/json" } });

describe("registerVoiceDebugRoute", () => {
  it("events[] → loggés (max 20, sanitisés) ; toujours {ok:true}", async () => {
    const logs: string[] = [];
    const app = await buildTestApp(allow, logs);
    const res = await post(app, { events: ["err A", "err\nB", { x: 1 }] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(logs).toHaveLength(3);
    expect(logs[1]).toBe("[VoiceDebug] err B"); // CRLF neutralisé
    await app.close();
  });

  it("msg → loggé ; throttle silencieux quand rate-limit atteint (pas de log, {ok:true})", async () => {
    const okLogs: string[] = [];
    const okApp = await buildTestApp(allow, okLogs);
    expect((await post(okApp, { msg: "boom" })).json()).toEqual({ ok: true });
    expect(okLogs).toHaveLength(1);
    await okApp.close();

    const throttledLogs: string[] = [];
    const throttledApp = await buildTestApp(deny, throttledLogs);
    const res = await post(throttledApp, { msg: "boom" });
    expect(res.json()).toEqual({ ok: true }); // throttle silencieux
    expect(throttledLogs).toHaveLength(0);
    await throttledApp.close();
  });

  it("corps vide / invalide → {ok:true} sans planter", async () => {
    const app = await buildTestApp(allow, []);
    expect((await post(app, {})).json()).toEqual({ ok: true });
    await app.close();
  });

  it("events > 20 → tronqué à 20", async () => {
    const logs: string[] = [];
    const app = await buildTestApp(allow, logs);
    await post(app, { events: Array.from({ length: 50 }, (_, i) => `e${i}`) });
    expect(logs).toHaveLength(20);
    await app.close();
  });
});

describe("sanitizeLogLine", () => {
  it("retire CRLF/contrôle et tronque à 500", () => {
    expect(sanitizeLogLine("a\r\nb\tc")).toBe("a  b c");
    expect(sanitizeLogLine("x".repeat(600))).toHaveLength(500);
    expect(sanitizeLogLine({ a: 1 })).toBe('{"a":1}');
  });
});
