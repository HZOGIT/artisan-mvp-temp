import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9952231;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `activites.*`) : suivi commercial « à faire » du tenant (protégé).
describe.skipIf(!URL)("activites.router e2e (protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from activites where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Activites SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("list / create sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "activites.list", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "activites.create", { titre: "X", echeance: "2026-09-01" })).statusCode).toBe(401);
  });

  it("create (cookie) → 200 et apparaît dans list", async () => {
    const tok = await jwt(UID);
    const created = await injectTrpc(app, "POST", "activites.create", { type: "relance", titre: "Relancer client A", echeance: "2026-09-01" }, tok);
    expect(created.statusCode).toBe(200);
    const list = await injectTrpc(app, "GET", "activites.list", undefined, tok);
    expect((list.json().result.data as Array<{ titre: string }>).some((a) => a.titre === "Relancer client A")).toBe(true);
  });

  it("validation : titre vide → 400 ; type hors enum → 400", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "POST", "activites.create", { titre: "", echeance: "2026-09-01" }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "activites.create", { titre: "Z", echeance: "2026-09-01", type: "fax" }, tok)).statusCode).toBe(400);
  });
});
