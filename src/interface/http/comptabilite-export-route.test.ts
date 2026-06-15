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
    await admin.query('delete from artisans where "userId" = $1', [UID]);
    await admin.query("delete from users where id = $1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email) values ($1, $2)", [UID, `u${UID}@test.fr`]);
    await admin.query('insert into artisans ("userId", siret) values ($1, $2)', [UID, "11122233300044"]);
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
});
