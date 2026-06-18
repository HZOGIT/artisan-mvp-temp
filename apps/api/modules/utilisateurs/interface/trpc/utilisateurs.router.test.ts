import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9942131; // owner artisan
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `utilisateurs.*`). Toutes les procédures sont gardées par la permission
// `utilisateurs.gerer` (admin bypasse). On vérifie la chaîne auth → tenant → permission.
describe.skipIf(!URL)("utilisateurs.router e2e (gardé par permission)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Equipe SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("sans cookie → 401 (authentification requise)", async () => {
    expect((await injectTrpc(app, "GET", "utilisateurs.list", undefined)).statusCode).toBe(401);
  });

  it("authentifié SANS la permission `utilisateurs.gerer` → 403", async () => {
    const res = await injectTrpc(app, "GET", "utilisateurs.list", undefined, await jwt(UID));
    expect(res.statusCode).toBe(403);
  });

  it("avec la permission `utilisateurs.gerer` → 200 (liste de l'équipe)", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [UID, "utilisateurs.gerer"]);
    const res = await injectTrpc(app, "GET", "utilisateurs.list", undefined, await jwt(UID));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().result.data)).toBe(true);
  });

  it("validation : invite avec rôle hors enum → 400 (permission accordée)", async () => {
    // la permission a été accordée au test précédent
    const res = await injectTrpc(app, "POST", "utilisateurs.invite", { email: "x@y.fr", nom: "Z", role: "patron" }, await jwt(UID));
    expect(res.statusCode).toBe(400);
  });
});
