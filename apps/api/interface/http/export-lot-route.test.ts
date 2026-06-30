import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { SignJWT } from "jose";
import type { TenantResolver } from "../../shared/tenant";
import { FakePdfPort } from "../../shared/ports";
import { registerExportLotRoutes, type ExportLotRouteDeps } from "./export-lot-route";

const SECRET = "test-secret-at-least-32-characters-long-exportlot!";
const sign = (userId: number) => new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
const resolver: TenantResolver = { resolve: async (claims) => ({ artisanId: 1, userId: claims.userId }) };

const FACTURES = [
  { id: 1, numero: "FAC-2026-0001", clientId: 5, dateFacture: new Date("2026-03-10"), statut: "validee" },
  { id: 2, numero: "FAC-2026-0002", clientId: 6, dateFacture: new Date("2026-06-10"), statut: "payee" },
];

function deps(over: Partial<ExportLotRouteDeps> = {}): Omit<ExportLotRouteDeps, "jwtSecret" | "resolver"> {
  return {
    factureLister: { list: async () => FACTURES },
    factureReader: {
      listLignes: async () => [{ designation: "L", quantite: "1", prixUnitaireHT: "100", tauxTVA: "20", montantHT: "100.00", montantTVA: "20.00", montantTTC: "120.00" }],
      listLignesByFactureIds: async (_c, ids) => ids.map((id) => ({ factureId: id, designation: "L", quantite: "1", prixUnitaireHT: "100", tauxTVA: "20", montantHT: "100.00", montantTVA: "20.00", montantTTC: "120.00" })),
    },
    clientReader: {
      getById: async (_c, id) => ({ id, nom: "Dupont" }),
      listByIds: async (_c, ids) => ids.map((id) => ({ id, nom: "Dupont" })),
    },
    artisanReader: { getProfile: async () => ({ id: 1, nomEntreprise: "ACME", siret: "12345678900011", tauxTVA: "20" }) },
    pdf: new FakePdfPort(),
    ...over,
  };
}

async function buildTestApp(over: Partial<ExportLotRouteDeps> = {}) {
  const app = Fastify();
  await app.register(cookie);
  registerExportLotRoutes(app, { jwtSecret: SECRET, resolver, ...deps(over) });
  await app.ready();
  return app;
}

const get = (app: Awaited<ReturnType<typeof buildTestApp>>, path: string, token?: string) =>
  app.inject({ method: "GET", url: `/api/comptabilite/${path}?dateDebut=2026-01-01&dateFin=2026-12-31`, headers: token ? { cookie: `token=${token}` } : {} });

describe("registerExportLotRoutes — export-facturx-lot", () => {
  it("sans cookie → 401", async () => {
    const app = await buildTestApp();
    expect((await get(app, "export-facturx-lot")).statusCode).toBe(401);
    await app.close();
  });

  it("succès → 200 application/zip + filename + signature ZIP (PK)", async () => {
    const app = await buildTestApp();
    const res = await get(app, "export-facturx-lot", await sign(5));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(String(res.headers["content-disposition"])).toContain("FacturX_20260101_20261231.zip");
    expect(res.rawPayload.subarray(0, 2).toString("latin1")).toBe("PK"); // entête local ZIP
    await app.close();
  });

  it("aucune facture sur la période → 404", async () => {
    const app = await buildTestApp({ factureLister: { list: async () => [] } });
    expect((await get(app, "export-facturx-lot", await sign(5))).statusCode).toBe(404);
    await app.close();
  });
});

describe("registerExportLotRoutes — export-pdf-lot", () => {
  it("sans cookie → 401", async () => {
    const app = await buildTestApp();
    expect((await get(app, "export-pdf-lot")).statusCode).toBe(401);
    await app.close();
  });

  it("succès → 200 application/zip + filename PDF", async () => {
    const app = await buildTestApp();
    const res = await get(app, "export-pdf-lot", await sign(5));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(String(res.headers["content-disposition"])).toContain("Factures_PDF_20260101_20261231.zip");
    expect(res.rawPayload.subarray(0, 2).toString("latin1")).toBe("PK");
    await app.close();
  });
});
