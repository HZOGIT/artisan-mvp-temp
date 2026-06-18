import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { SignJWT } from "jose";
import type { TenantResolver } from "../../shared/tenant";
import { FakePdfPort } from "../../shared/ports";
import { registerFacturxRoutes, type FacturxRouteDeps } from "./facturx-route";

const SECRET = "test-secret-at-least-32-characters-long-facturx!";
const sign = (userId: number) => new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const resolver: TenantResolver = { resolve: async (claims) => ({ artisanId: 1, userId: claims.userId }) };

function deps(over: Partial<FacturxRouteDeps> = {}): Omit<FacturxRouteDeps, "jwtSecret" | "resolver"> {
  return {
    factureReader: {
      getById: async () => ({ clientId: 5, numero: "FAC-2026-0001" }),
      listLignes: async () => [{ designation: "Main d'œuvre", quantite: "1", prixUnitaireHT: "100", tauxTVA: "20", montantHT: "100.00", montantTVA: "20.00", montantTTC: "120.00" }],
    },
    clientReader: { getById: async () => ({ id: 5, nom: "Dupont", adresse: "1 rue A", codePostal: "75000", ville: "Paris" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME", siret: "12345678900011", tauxTVA: "20" }) },
    pdf: new FakePdfPort(),
    ...over,
  };
}

async function buildTestApp(over: Partial<FacturxRouteDeps> = {}) {
  const app = Fastify();
  await app.register(cookie);
  registerFacturxRoutes(app, { jwtSecret: SECRET, resolver, ...deps(over) });
  await app.ready();
  return app;
}

const getXml = (app: Awaited<ReturnType<typeof buildTestApp>>, id: string, token?: string) =>
  app.inject({ method: "GET", url: `/api/comptabilite/facturx-xml/${id}`, headers: token ? { cookie: `token=${token}` } : {} });
const getPdf = (app: Awaited<ReturnType<typeof buildTestApp>>, id: string, token?: string) =>
  app.inject({ method: "GET", url: `/api/comptabilite/facturx/${id}`, headers: token ? { cookie: `token=${token}` } : {} });

describe("registerFacturxRoutes — facturx-xml", () => {
  it("sans cookie → 401", async () => {
    const app = await buildTestApp();
    expect((await getXml(app, "7")).statusCode).toBe(401);
    await app.close();
  });

  it("id invalide → 400", async () => {
    const app = await buildTestApp();
    expect((await getXml(app, "abc", await sign(5))).statusCode).toBe(400);
    await app.close();
  });

  it("succès → 200 application/xml + Content-Disposition + corps CII", async () => {
    const app = await buildTestApp();
    const res = await getXml(app, "7", await sign(5));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(String(res.headers["content-disposition"])).toContain("FacturX_FAC-2026-0001.xml");
    expect(res.body).toContain("FAC-2026-0001");
    expect(res.body).toContain("12345678900011");
    await app.close();
  });

  it("facture hors tenant → 404 (anti-IDOR)", async () => {
    const app = await buildTestApp({ factureReader: { getById: async () => null, listLignes: async () => [] } });
    expect((await getXml(app, "99", await sign(5))).statusCode).toBe(404);
    await app.close();
  });
});

describe("registerFacturxRoutes — facturx (PDF)", () => {
  it("sans cookie → 401", async () => {
    const app = await buildTestApp();
    expect((await getPdf(app, "7")).statusCode).toBe(401);
    await app.close();
  });

  it("succès → 200 application/pdf + filename Factur-X", async () => {
    const app = await buildTestApp();
    const res = await getPdf(app, "7", await sign(5));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(String(res.headers["content-disposition"])).toContain("Facture_FAC-2026-0001_FacturX.pdf");
    await app.close();
  });

  it("facture hors tenant → 404 (anti-IDOR)", async () => {
    const app = await buildTestApp({ factureReader: { getById: async () => null, listLignes: async () => [] } });
    expect((await getPdf(app, "99", await sign(5))).statusCode).toBe(404);
    await app.close();
  });
});
