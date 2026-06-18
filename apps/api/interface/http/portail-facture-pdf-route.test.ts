import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { FakePdfPort } from "../../shared/ports";
import { registerPortailFacturePdfRoute } from "./portail-facture-pdf-route";
import type { PortalFacturePdfDeps } from "../../modules/paiement/application/portal-facture-pdf";

const allow: RateLimiterPort = { check: async () => true };
const deny: RateLimiterPort = { check: async () => false };

function deps(over: Partial<PortalFacturePdfDeps> = {}): PortalFacturePdfDeps {
  return {
    accessReader: { resolveAccessByToken: async () => ({ clientId: 5, artisanId: 1 }) },
    factureReader: { getById: async () => ({ clientId: 5, numero: "FAC-1" }), listLignes: async () => [] },
    clientReader: { getById: async () => ({ id: 5, nom: "Dupont" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME" }) },
    cgvReader: { getCgv: async () => null },
    pdf: new FakePdfPort(),
    ...over,
  };
}

async function buildTestApp(over: Partial<PortalFacturePdfDeps> = {}, rateLimiter: RateLimiterPort = allow) {
  const app = Fastify();
  registerPortailFacturePdfRoute(app, { ...deps(over), rateLimiter });
  await app.ready();
  return app;
}

const get = (app: Awaited<ReturnType<typeof buildTestApp>>, token: string, id: string) =>
  app.inject({ method: "GET", url: `/api/portail/${token}/factures/${id}/pdf` });

describe("registerPortailFacturePdfRoute (public par token)", () => {
  it("rate-limit IP → 429", async () => {
    const app = await buildTestApp({}, deny);
    expect((await get(app, "tok", "7")).statusCode).toBe(429);
    await app.close();
  });

  it("succès → 200 application/pdf + filename Facture_FAC-1.pdf", async () => {
    const app = await buildTestApp();
    const res = await get(app, "tok", "7");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(String(res.headers["content-disposition"])).toContain("Facture_FAC-1.pdf");
    await app.close();
  });

  it("token invalide → 403 ; facture d'un autre client → 404", async () => {
    const app1 = await buildTestApp({ accessReader: { resolveAccessByToken: async () => null } });
    expect((await get(app1, "bad", "7")).statusCode).toBe(403);
    await app1.close();
    const app2 = await buildTestApp({ factureReader: { getById: async () => ({ clientId: 999, numero: "X" }), listLignes: async () => [] } });
    expect((await get(app2, "tok", "7")).statusCode).toBe(404);
    await app2.close();
  });
});
