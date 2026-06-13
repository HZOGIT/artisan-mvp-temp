import { describe, it, expect, afterAll } from "vitest";
import { buildApp } from "./app";

describe("app Fastify (scaffold + tRPC)", () => {
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

  it("tRPC: GET /api/trpc/health → 200 (procedure publique servie)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/trpc/health" });
    expect(res.statusCode).toBe(200);
    // Format tRPC v11 (non-batché) : { result: { data: { status: 'ok' } } }
    expect(res.json()).toMatchObject({ result: { data: { status: "ok" } } });
  });

  it("tRPC: une procédure inexistante → 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/trpc/nope" });
    expect(res.statusCode).toBe(404);
  });
});
