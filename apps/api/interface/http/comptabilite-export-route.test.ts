import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../app";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-fecexp";
const UID = 9991131;

async function signToken(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@test.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

// E2E de `/api/comptabilite/fec` via le routeur MONTÉ (auth cookie JWT). Vérifie 401 sans cookie,
// 200 + en-têtes de conformité (équilibre Σdébit=Σcrédit) + Content-Disposition pour un artisan réel.
describe.skipIf(!URL)("GET /api/comptabilite/fec (export FEC, auth cookie)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from artisans where "userId" = $1', [UID]);
    await admin.query("delete from users where id = $1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email) values ($1, $2)", [UID, `u${UID}@test.fr`]);
    const aid = (await admin.query('insert into artisans ("userId", siret) values ($1, $2) returning id', [UID, "11122233300044"])).rows[0].id;
    // une facture dans la période pour l'export CSV (avec un nom client à risque d'injection CSV)
    const clientId = (await admin.query('insert into clients ("artisanId", nom) values ($1, $2) returning id', [aid, "Durand;Test"])).rows[0].id;
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"dateFacture","totalHT","totalTVA","totalTTC") values ($1,$2,$3,$4,$5,$6,$7,$8)', [aid, clientId, "FAC-CSV-1", "payee", "2026-03-15", "100.00", "20.00", "120.00"]);
    app = buildApp({ jwtSecret: SECRET });
  });
  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("sans cookie → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/comptabilite/fec" });
    expect(res.statusCode).toBe(401);
  });

  it("avec cookie → 200 + FEC équilibré (en-têtes conformité) + filename réglementaire", async () => {
    const token = await signToken(UID);
    const res = await app.inject({ method: "GET", url: "/api/comptabilite/fec?dateDebut=2026-01-01&dateFin=2026-06-30", headers: { cookie: `token=${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["content-disposition"]).toContain("111222333FEC20260630.txt");
    // Invariant FEC : Σdébit = Σcrédit (équilibre).
    expect(res.headers["x-fec-equilibre"]).toBe("1");
    expect(res.headers["x-fec-debit"]).toBe(res.headers["x-fec-credit"]);
    expect(res.body).toContain("JournalCode\tJournalLib"); // entête FEC 18 colonnes
  });

  it("export-csv sans cookie → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/comptabilite/export-csv" });
    expect(res.statusCode).toBe(401);
  });

  it("export-csv avec cookie → 200 text/csv + facture + nom client neutralisé (anti-injection)", async () => {
    const token = await signToken(UID);
    const res = await app.inject({ method: "GET", url: "/api/comptabilite/export-csv?dateDebut=2026-01-01&dateFin=2026-06-30", headers: { cookie: `token=${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("factures_20260101_20260630.csv");
    expect(res.body).toContain("Date;Numéro;Client;HT;TVA;TTC;Statut");
    expect(res.body).toContain("FAC-CSV-1");
    // le nom client contient `;` → échappé entre guillemets (anti-rupture de structure)
    expect(res.body).toContain('"Durand;Test"');
  });
});
