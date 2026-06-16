import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9961321;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `devisIA.*`) : analyses photos → suggestions → devis (protégé, anti-IDOR).
// On couvre le CRUD déterministe (sans la passe Vision `analyserPhotos`).
describe.skipIf(!URL)("devisIA.router e2e (protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from analyses_photos where "artisanId" in (select id from artisans where "userId"=$1)', [UID]).catch(() => {});
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "DevisIA SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("list / createAnalyse sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "devisIA.list", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "devisIA.createAnalyse", { titre: "X" })).statusCode).toBe(401);
  });

  it("createAnalyse (cookie) → 200 et getById retrouve l'analyse", async () => {
    const tok = await jwt(UID);
    const created = await injectTrpc(app, "POST", "devisIA.createAnalyse", { titre: "Toiture maison", description: "Tuiles cassées" }, tok);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    expect(id).toBeGreaterThan(0);
    const byId = await injectTrpc(app, "GET", "devisIA.getById", { id }, tok);
    expect(byId.statusCode).toBe(200);
    expect(byId.json().result.data?.titre).toBe("Toiture maison");
  });

  it("validation : getById id non positif → 400 ; anti-IDOR addPhoto sur analyse inexistante → 404", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "GET", "devisIA.getById", { id: 0 }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "devisIA.addPhoto", { analyseId: 999999999, url: "https://x/p.jpg" }, tok)).statusCode).toBe(404);
  });
});
