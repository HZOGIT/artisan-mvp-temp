import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { FakePdfPort } from "../../shared/ports";
import { registerPortailDevisPdfRoute } from "./portail-devis-pdf-route";
import type { PortalDevisPdfDeps } from "../../modules/paiement/application/portal-devis-pdf";

const allow: RateLimiterPort = { check: async () => true };
const deny: RateLimiterPort = { check: async () => false };

function deps(over: Partial<PortalDevisPdfDeps> = {}): PortalDevisPdfDeps {
  return {
    accessReader: { resolveAccessByToken: async () => ({ clientId: 5, artisanId: 1 }) },
    devisReader: { getById: async () => ({ clientId: 5, numero: "DEV-1" }), listLignes: async () => [] },
    clientReader: { getById: async () => ({ id: 5, nom: "Dupont" }) },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME" }) },
    cgvReader: { getCgv: async () => null },
    pdf: new FakePdfPort(),
    ...over,
  };
}

async function buildTestApp(over: Partial<PortalDevisPdfDeps> = {}, rateLimiter: RateLimiterPort = allow) {
  const app = Fastify();
  registerPortailDevisPdfRoute(app, { ...deps(over), rateLimiter });
  await app.ready();
  return app;
}

const get = (app: Awaited<ReturnType<typeof buildTestApp>>, token: string, id: string) =>
  app.inject({ method: "GET", url: `/api/portail/${token}/devis/${id}/pdf` });

describe("registerPortailDevisPdfRoute (public par token)", () => {
  it("rate-limit IP atteint → 429", async () => {
    const app = await buildTestApp({}, deny);
    expect((await get(app, "tok", "7")).statusCode).toBe(429);
    await app.close();
  });

  it("succès → 200 application/pdf + Content-Disposition", async () => {
    const app = await buildTestApp();
    const res = await get(app, "tok", "7");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(String(res.headers["content-disposition"])).toContain("Devis_DEV-1.pdf");
    await app.close();
  });

  it("token invalide → 403", async () => {
    const app = await buildTestApp({ accessReader: { resolveAccessByToken: async () => null } });
    expect((await get(app, "bad", "7")).statusCode).toBe(403);
    await app.close();
  });

  it("devis d'un autre client → 404", async () => {
    const app = await buildTestApp({ devisReader: { getById: async () => ({ clientId: 999, numero: "X" }), listLignes: async () => [] } });
    expect((await get(app, "tok", "7")).statusCode).toBe(404);
    await app.close();
  });
});
