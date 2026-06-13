import { describe, it, expect, afterAll } from "vitest";
import { buildApp } from "./app";

describe("app Fastify (scaffold)", () => {
  const app = buildApp();
  afterAll(() => app.close());

  it("GET /health → 200 { status: 'ok' }", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("route inconnue → 404", async () => {
    const res = await app.inject({ method: "GET", url: "/inexistant" });
    expect(res.statusCode).toBe(404);
  });
});
