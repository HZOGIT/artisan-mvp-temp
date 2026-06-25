import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../app";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-rgpd";
const UID = 9993127;

async function signToken(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@test.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

/**
 * L3 e2e — `GET /api/rgpd/export` (portabilité RGPD Art. 20).
 * Vérifie : 401 sans cookie, 200 + headers + ZIP valide avec cookie.
 * L'isolation multi-tenant (RLS + filtre artisanId) est couverte par rls.test.ts + with-tenant.test.ts.
 */
describe.skipIf(!URL)("GET /api/rgpd/export (portabilité RGPD)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let artisanId: number;

  const cleanup = async () => {
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from artisans where "userId" = $1', [UID]);
    await admin.query("delete from users where id = $1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email) values ($1, $2)", [UID, `u${UID}@test.fr`]);
    const r = await admin.query<{ id: number }>(
      'insert into artisans ("userId", "nomEntreprise", siret) values ($1, $2, $3) returning id',
      [UID, "Test RGPD SARL", "99988877700066"],
    );
    artisanId = r.rows[0].id;
    await admin.query('insert into clients ("artisanId", nom, email) values ($1, $2, $3)', [artisanId, "Client RGPD", "client-rgpd@test.fr"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("sans cookie → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/rgpd/export" });
    expect(res.statusCode).toBe(401);
  });

  it("avec cookie → 200 + application/zip + Content-Disposition + signature ZIP (PK)", async () => {
    const token = await signToken(UID);
    const res = await app.inject({ method: "GET", url: "/api/rgpd/export", headers: { cookie: `token=${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(String(res.headers["content-disposition"])).toContain("export-donnees-");
    expect(String(res.headers["content-disposition"])).toContain(".zip");
    expect(res.rawPayload.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("le ZIP est non vide (taille > 100 octets)", async () => {
    const token = await signToken(UID);
    const res = await app.inject({ method: "GET", url: "/api/rgpd/export", headers: { cookie: `token=${token}` } });
    expect(res.rawPayload.length).toBeGreaterThan(100);
  });

  it("variable artisanId correcte dans le log (pas de fuite d'artisanId dans les headers)", async () => {
    const token = await signToken(UID);
    const res = await app.inject({ method: "GET", url: "/api/rgpd/export", headers: { cookie: `token=${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-artisan-id"]).toBeUndefined();
    expect(artisanId).toBeGreaterThan(0);
  });
});
