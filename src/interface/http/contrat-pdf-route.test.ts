import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { SignJWT } from "jose";
import type { TenantResolver } from "../../shared/tenant";
import { FakePdfPort } from "../../shared/ports";
import { registerContratPdfRoute } from "./contrat-pdf-route";
import type { ContratPdfDeps } from "../../modules/contrats-maintenance/application/contrat-pdf";

const SECRET = "test-secret-at-least-32-characters-long-ctpdf!";
const sign = (userId: number) => new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const resolver: TenantResolver = { resolve: async (claims) => ({ artisanId: 1, userId: claims.userId }) };

function deps(over: Partial<ContratPdfDeps> = {}): ContratPdfDeps {
  return {
    contratRepo: { getById: async () => ({ clientId: 5, reference: "CT-2026-0001" }) },
    clientReader: { getById: async () => ({ id: 5, nom: "Dupont" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME" }) },
    pdf: new FakePdfPort(),
    ...over,
  };
}

async function buildTestApp(over: Partial<ContratPdfDeps> = {}) {
  const app = Fastify();
  await app.register(cookie);
  registerContratPdfRoute(app, { jwtSecret: SECRET, resolver, ...deps(over) });
  await app.ready();
  return app;
}

const get = (app: Awaited<ReturnType<typeof buildTestApp>>, id: string, token?: string) =>
  app.inject({ method: "GET", url: `/api/contrats/${id}/pdf`, headers: token ? { cookie: `token=${token}` } : {} });

describe("registerContratPdfRoute", () => {
  it("sans cookie → 401", async () => {
    const app = await buildTestApp();
    expect((await get(app, "7")).statusCode).toBe(401);
    await app.close();
  });

  it("succès → 200 application/pdf + Content-Disposition", async () => {
    const app = await buildTestApp();
    const res = await get(app, "7", await sign(5));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(String(res.headers["content-disposition"])).toContain("CT-2026-0001.pdf");
    await app.close();
  });

  it("contrat hors tenant → 404 (anti-IDOR)", async () => {
    const app = await buildTestApp({ contratRepo: { getById: async () => null } });
    expect((await get(app, "99", await sign(5))).statusCode).toBe(404);
    await app.close();
  });
});
