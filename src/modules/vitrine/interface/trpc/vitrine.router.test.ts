import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9964351;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `vitrine.*`) : surface PUBLIQUE (getBySlug/submitContact, sans cookie) + ADMIN
// leads (getDemandesContact/updateStatut/convertir, protégée).
describe.skipIf(!URL)("vitrine.router e2e (public + admin leads)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Vitrine SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("ADMIN getDemandesContact sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "vitrine.getDemandesContact", undefined)).statusCode).toBe(401);
  });

  it("getDemandesContact (cookie) → 200, tableau (aucun lead → [])", async () => {
    const res = await injectTrpc(app, "GET", "vitrine.getDemandesContact", undefined, await jwt(UID));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().result.data)).toBe(true);
  });

  it("PUBLIC submitContact : validation (message < 10 / email invalide) → 400 (sans cookie)", async () => {
    const base = { slug: "vitrine-sarl", nom: "Jean", email: "jean@example.com", message: "Bonjour je suis intéressé." };
    expect((await injectTrpc(app, "POST", "vitrine.submitContact", { ...base, message: "court" })).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "vitrine.submitContact", { ...base, email: "pas-un-email" })).statusCode).toBe(400);
  });

  it("ADMIN updateDemandeContactStatut : sans cookie → 401 ; statut hors enum → 400", async () => {
    expect((await injectTrpc(app, "POST", "vitrine.updateDemandeContactStatut", { id: 1, statut: "nouveau" })).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "vitrine.updateDemandeContactStatut", { id: 1, statut: "archive" }, await jwt(UID))).statusCode).toBe(400);
  });
});
