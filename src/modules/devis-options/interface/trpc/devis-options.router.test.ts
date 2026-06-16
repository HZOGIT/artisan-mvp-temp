import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9955261;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `devisOptions.*`) : variantes d'un devis du tenant (protégé, anti-IDOR via parent).
describe.skipIf(!URL)("devisOptions.router e2e (protégé + anti-IDOR)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let devisId = 0;

  const cleanup = async () => {
    await admin.query('delete from devis_options where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId"=$1))', [UID]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    const artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "Options SARL"])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanId, "C"])).rows[0].id;
    devisId = (await admin.query('insert into devis ("artisanId","clientId",numero) values ($1,$2,$3) returning id', [artisanId, clientId, "DEV-OPT"])).rows[0].id;
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getByDevisId / create sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "devisOptions.getByDevisId", { devisId })).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "devisOptions.create", { devisId, nom: "X" })).statusCode).toBe(401);
  });

  it("create (cookie) → 200 et getByDevisId reflète l'option", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "GET", "devisOptions.getByDevisId", { devisId }, tok)).json().result.data).toEqual([]);
    const created = await injectTrpc(app, "POST", "devisOptions.create", { devisId, nom: "Option A", recommandee: true }, tok);
    expect(created.statusCode).toBe(200);
    const list = await injectTrpc(app, "GET", "devisOptions.getByDevisId", { devisId }, tok);
    expect((list.json().result.data as Array<{ nom: string }>).some((o) => o.nom === "Option A")).toBe(true);
  });

  it("anti-IDOR : create sur un devis non possédé → 404", async () => {
    const res = await injectTrpc(app, "POST", "devisOptions.create", { devisId: 999999999, nom: "Vol" }, await jwt(UID));
    expect(res.statusCode).toBe(404);
  });

  it("validation : nom > 100 caractères → 400", async () => {
    const res = await injectTrpc(app, "POST", "devisOptions.create", { devisId, nom: "x".repeat(101) }, await jwt(UID));
    expect(res.statusCode).toBe(400);
  });
});
