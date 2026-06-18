import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { SignJWT } from "jose";
import type { TenantResolver } from "../../shared/tenant";
import { FakePdfPort } from "../../shared/ports";
import { registerInterventionPdfRoute } from "./intervention-pdf-route";
import type { InterventionPdfDeps } from "../../modules/interventions/application/intervention-pdf";

const SECRET = "test-secret-at-least-32-characters-long-ivpdf!";
const sign = (userId: number) => new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const resolver: TenantResolver = { resolve: async (claims) => ({ artisanId: 1, userId: claims.userId }) };

function deps(over: Partial<InterventionPdfDeps> = {}): InterventionPdfDeps {
  return {
    interventionRepo: { getById: async () => ({ clientId: 5, technicienId: null }) },
    clientReader: { getById: async () => ({ id: 5, nom: "Dupont" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME" }) },
    technicienReader: { getById: async () => null },
    pdf: new FakePdfPort(),
    ...over,
  };
}

async function buildTestApp(over: Partial<InterventionPdfDeps> = {}) {
  const app = Fastify();
  await app.register(cookie);
  registerInterventionPdfRoute(app, { jwtSecret: SECRET, resolver, ...deps(over) });
  await app.ready();
  return app;
}

const get = (app: Awaited<ReturnType<typeof buildTestApp>>, id: string, token?: string) =>
  app.inject({ method: "GET", url: `/api/interventions/${id}/bon-pdf`, headers: token ? { cookie: `token=${token}` } : {} });

describe("registerInterventionPdfRoute", () => {
  it("sans cookie → 401", async () => {
    const app = await buildTestApp();
    expect((await get(app, "9")).statusCode).toBe(401);
    await app.close();
  });

  it("succès → 200 application/pdf + filename bon-intervention-9.pdf", async () => {
    const app = await buildTestApp();
    const res = await get(app, "9", await sign(5));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(String(res.headers["content-disposition"])).toContain("bon-intervention-9.pdf");
    await app.close();
  });

  it("intervention hors tenant → 404 (anti-IDOR)", async () => {
    const app = await buildTestApp({ interventionRepo: { getById: async () => null } });
    expect((await get(app, "99", await sign(5))).statusCode).toBe(404);
    await app.close();
  });
});
