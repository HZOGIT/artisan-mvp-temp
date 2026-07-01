import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9950211; /** owner artisan avec statistiques.voir */
const UID2 = 9950212; /** collaborateur non-owner SANS statistiques.voir — anti-674 */
const EMAIL = `u${UID}@t.fr`;
const EMAIL2 = `u${UID2}@t.fr`;

const jwt = (userId: number, email: string) =>
  new SignJWT({ userId, email }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

/** L3 e2e : toutes les procédures rapports sont gatées par `statistiques.voir`. */
describe.skipIf(!URL)("rapports.router e2e (statistiques.voir)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from rapports_personnalises where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query("delete from users where id=$1", [UID2]);
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    const { rows } = await admin.query<{ id: number }>('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "Rapports SARL"]);
    const artisanId = rows[0].id;
    await admin.query('insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'artisan\',$3)', [UID2, EMAIL2, artisanId]);
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [UID, "statistiques.voir"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("list / create sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "rapports.list", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "rapports.create", { nom: "X", type: "ventes" })).statusCode).toBe(401);
  });

  it("membre SANS statistiques.voir → 403 sur create", async () => {
    const res = await injectTrpc(app, "POST", "rapports.create", { nom: "X", type: "ventes" }, await jwt(UID2, EMAIL2));
    expect(res.statusCode).toBe(403);
  });

  it("membre SANS statistiques.voir → 403 sur list", async () => {
    const res = await injectTrpc(app, "GET", "rapports.list", undefined, await jwt(UID2, EMAIL2));
    expect(res.statusCode).toBe(403);
  });

  it("create AVEC statistiques.voir → 200 et apparaît dans list", async () => {
    const tok = await jwt(UID, EMAIL);
    const created = await injectTrpc(app, "POST", "rapports.create", { nom: "CA mensuel", type: "ventes" }, tok);
    expect(created.statusCode).toBe(200);
    const list = await injectTrpc(app, "GET", "rapports.list", undefined, tok);
    expect((list.json().result.data as Array<{ nom: string }>).some((r) => r.nom === "CA mensuel")).toBe(true);
  });

  it("validation : nom vide → 400 ; type hors enum → 400", async () => {
    const tok = await jwt(UID, EMAIL);
    expect((await injectTrpc(app, "POST", "rapports.create", { nom: "", type: "ventes" }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "rapports.create", { nom: "Z", type: "meteo" }, tok)).statusCode).toBe(400);
  });
});
