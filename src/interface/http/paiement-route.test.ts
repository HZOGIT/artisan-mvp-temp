import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { buildApp } from "../../app";

const URL = process.env.DATABASE_URL;
const UID = 9991151;
const TOKEN = "payroute-9991151-xxxxxxxxxxxxxxxxxxxxxxxxxxx";

// E2E `GET /api/paiement/status/:factureId?token=…` via le routeur MONTÉ (public par token portail).
describe.skipIf(!URL)("GET /api/paiement/status/:factureId (public par token portail)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let factureId = 0;

  const cleanup = async () => {
    await admin.query('delete from client_portal_access where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    const artisanId = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanId, "Durand"])).rows[0].id;
    factureId = (await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5) returning id', [artisanId, clientId, "FAC-R", "envoyee", "240.00"])).rows[0].id;
    await admin.query('insert into client_portal_access ("clientId","artisanId",token,email,"expiresAt","isActive") values ($1,$2,$3,$4, now() + interval \'7 days\', true)', [clientId, artisanId, TOKEN, "c@test.com"]);
    app = buildApp();
  });
  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("sans token → 400", async () => {
    const res = await app.inject({ method: "GET", url: `/api/paiement/status/${factureId}` });
    expect(res.statusCode).toBe(400);
  });

  it("token inconnu → 403", async () => {
    const res = await app.inject({ method: "GET", url: `/api/paiement/status/${factureId}?token=absent-zzzzzzzz` });
    expect(res.statusCode).toBe(403);
  });

  it("token valide → 200 + statut facture", async () => {
    const res = await app.inject({ method: "GET", url: `/api/paiement/status/${factureId}?token=${TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ factureId, statutFacture: "envoyee", montantTTC: "240.00" });
  });
});
