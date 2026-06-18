import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { SignJWT } from "jose";
import { registerClientsRestRoute } from "./clients-rest-route";
import { FakeClientRepository } from "../../../modules/clients/infra/client-repository-fake";
import type { TenantResolver, TokenClaims, TenantContext } from "../../../shared/tenant";

const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const ARTISAN_A = 4242;
const ARTISAN_B = 9999;

function sign(userId: number, email: string): Promise<string> {
  return new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

// Résolveur de tenant fake : mappe userId → artisanId (sans DB). userId inconnu → pas d'artisan.
class FakeResolver implements TenantResolver {
  async resolve(claims: TokenClaims): Promise<TenantContext | null> {
    if (claims.userId === 1) return { artisanId: ARTISAN_A, userId: 1, role: "artisan" };
    if (claims.userId === 2) return { artisanId: ARTISAN_B, userId: 2, role: "artisan" };
    return null; // user sans artisan
  }
}

// E2E HTTP de la façade REST clients (PoC OPE-366) — SANS base : route montée seule sur une instance
// Fastify minimale, repo + resolver fakes injectés, cookie `token` signé. Verrouille le contrat
// consommé par le client openapi-typescript : auth, isolation tenant, forme JSON (dates ISO).
describe("GET /api/rest/clients (façade REST, fakes)", () => {
  const repo = new FakeClientRepository();
  let app: FastifyInstance;

  beforeAll(async () => {
    await repo.create({ artisanId: ARTISAN_A, userId: 1 }, { nom: "Dupont", email: "a@ex.fr" });
    await repo.create({ artisanId: ARTISAN_A, userId: 1 }, { nom: "Martin" });
    await repo.create({ artisanId: ARTISAN_B, userId: 2 }, { nom: "Autre tenant" });

    app = Fastify();
    await app.register(cookie);
    registerClientsRestRoute(app, { jwtSecret: SECRET, resolver: new FakeResolver(), repo });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("sans cookie → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/rest/clients" });
    expect(res.statusCode).toBe(401);
  });

  it("user sans artisan → 404", async () => {
    const token = await sign(7, "no-artisan@ex.fr");
    const res = await app.inject({ method: "GET", url: "/api/rest/clients", headers: { cookie: `token=${token}` } });
    expect(res.statusCode).toBe(404);
  });

  it("cookie valide → liste scopée tenant (isolation cross-tenant)", async () => {
    const token = await sign(1, "a@ex.fr");
    const res = await app.inject({ method: "GET", url: "/api/rest/clients", headers: { cookie: `token=${token}` } });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ nom: string; createdAt: string }>;
    expect(rows.map((r) => r.nom).sort()).toEqual(["Dupont", "Martin"]);
    expect(rows.map((r) => r.nom)).not.toContain("Autre tenant");
    // Dates sérialisées en ISO (string) — contrat REST self-descriptible (vs superjson tRPC).
    expect(typeof rows[0]?.createdAt).toBe("string");
  });

  it("getById d'un autre tenant → 404 (anti-oracle PII)", async () => {
    const token = await sign(1, "a@ex.fr");
    // Le client id=3 appartient à ARTISAN_B → invisible pour ARTISAN_A.
    const res = await app.inject({ method: "GET", url: "/api/rest/clients/3", headers: { cookie: `token=${token}` } });
    expect(res.statusCode).toBe(404);
  });
});
