import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9963341;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `importErp.*`) : import de reprise de données par lot (protégé, scopé tenant).
describe.skipIf(!URL)("importErp.router e2e (protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "ImportErp SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("importClients sans cookie → 401", async () => {
    expect((await injectTrpc(app, "POST", "importErp.importClients", { rows: [{ nom: "X" }], mapping: { nom: "nom" } })).statusCode).toBe(401);
  });

  it("importClients (cookie) avec mapping → 200 et crée les clients", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "POST", "importErp.importClients", { rows: [{ Nom: "Durand" }, { Nom: "Martin" }], mapping: { Nom: "nom" } }, tok);
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data).toBeTruthy();
    const { rows } = await admin.query('select count(*)::int n from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    expect(rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it("validation : lot > 5000 lignes → 400", async () => {
    const big = Array.from({ length: 5001 }, () => ({ nom: "X" }));
    const res = await injectTrpc(app, "POST", "importErp.importClients", { rows: big, mapping: { nom: "nom" } }, await jwt(UID));
    expect(res.statusCode).toBe(400);
  });
});
