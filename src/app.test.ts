import { describe, it, expect, afterAll } from "vitest";
import { buildApp } from "./app";
import { MIGRATED_DOMAINS } from "./interface/gateway/migrated-domains";

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

  // Garde-fou bascule : chaque domaine du registre MIGRATED_DOMAINS est réellement monté
  // dans le nouveau stack (procédure `list` présente → 401 auth requise, pas 404 inexistant).
  const sampleProcedure: Record<string, string> = { vehicules: "vehicules.list", avis: "avis.list", badges: "badges.list", techniciens: "techniciens.list", notifications: "notifications.list", fournisseurs: "fournisseurs.list", commandes: "commandes.list", stocks: "stocks.list", clients: "clients.list", interventions: "interventions.list", conges: "conges.list", notesDeFrais: "notesDeFrais.list", chantiers: "chantiers.list", depenses: "depenses.list", devis: "devis.list", factures: "factures.list" };
  for (const domain of MIGRATED_DOMAINS) {
    it(`domaine migré « ${domain} » monté dans le nouveau stack (≠ 404)`, async () => {
      const res = await app.inject({ method: "GET", url: `/api/trpc/${sampleProcedure[domain]}` });
      expect(res.statusCode).toBe(401); // procédure protégée existante, auth requise
    });
  }

  it("un domaine non migré (support) n'est PAS monté → 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/trpc/support.list" });
    expect(res.statusCode).toBe(404);
  });
});
