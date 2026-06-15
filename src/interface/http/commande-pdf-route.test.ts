import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { SignJWT } from "jose";
import type { TenantResolver } from "../../shared/tenant";
import { FakePdfPort } from "../../shared/ports";
import { registerCommandePdfRoute } from "./commande-pdf-route";
import type { BonCommandePdfDeps } from "../../modules/commandes/application/bon-commande-pdf";

const SECRET = "test-secret-at-least-32-characters-long-cpdf!!";
const sign = (userId: number) => new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const resolver: TenantResolver = { resolve: async (claims) => ({ artisanId: 1, userId: claims.userId }) };

function deps(over: Partial<BonCommandePdfDeps> = {}): BonCommandePdfDeps {
  return {
    commandeRepo: { getById: async () => ({ id: 7, fournisseurId: 3, numero: "BC-0007" }), listLignes: async () => [] },
    fournisseurReader: { getById: async () => ({ id: 3, nom: "F" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME" }) },
    pdf: new FakePdfPort(),
    ...over,
  };
}

async function buildTestApp(over: Partial<BonCommandePdfDeps> = {}) {
  const app = Fastify();
  await app.register(cookie);
  registerCommandePdfRoute(app, { jwtSecret: SECRET, resolver, ...deps(over) });
  await app.ready();
  return app;
}

const get = (app: Awaited<ReturnType<typeof buildTestApp>>, id: string, token?: string) =>
  app.inject({ method: "GET", url: `/api/commandes-fournisseurs/${id}/pdf`, headers: token ? { cookie: `token=${token}` } : {} });

describe("registerCommandePdfRoute", () => {
  it("sans cookie → 401", async () => {
    const app = await buildTestApp();
    expect((await get(app, "7")).statusCode).toBe(401);
    await app.close();
  });

  it("id invalide → 400", async () => {
    const app = await buildTestApp();
    expect((await get(app, "abc", await sign(5))).statusCode).toBe(400);
    await app.close();
  });

  it("succès → 200 application/pdf + Content-Disposition", async () => {
    const app = await buildTestApp();
    const res = await get(app, "7", await sign(5));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(String(res.headers["content-disposition"])).toContain("BonCommande_BC-0007.pdf");
    expect(res.rawPayload.length).toBeGreaterThan(0);
    await app.close();
  });

  it("commande hors tenant → 404 (anti-IDOR)", async () => {
    const app = await buildTestApp({ commandeRepo: { getById: async () => null, listLignes: async () => [] } });
    expect((await get(app, "99", await sign(5))).statusCode).toBe(404);
    await app.close();
  });
});
