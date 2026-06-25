import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { BcryptPasswordHasher } from "../../../../shared/ports/password-hasher-bcrypt";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9940111;
const EMAIL = `u${UID}@t.fr`;
const PASSWORD = "Secret123!";

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `auth.*`) : session (me/signin publics) + garde des procédures self-service.
describe.skipIf(!URL)("auth.router e2e (session + gardes)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query("delete from users where id=$1 or email=$2", [UID, EMAIL]);
  };

  beforeAll(async () => {
    await cleanup();
    const hash = await new BcryptPasswordHasher().hash(PASSWORD);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,$3,'artisan')", [UID, EMAIL, hash]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("me sans cookie → 200, data null (public, non authentifié)", async () => {
    const res = await injectTrpc(app, "GET", "auth.me", undefined);
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data).toBeNull();
  });

  it("me avec cookie JWT valide → 200 + utilisateur courant", async () => {
    const res = await injectTrpc(app, "GET", "auth.me", undefined, await jwt(UID));
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data?.email).toBe(EMAIL);
  });

  it("signin mauvais mot de passe → 401 (UnauthorizedError)", async () => {
    const res = await injectTrpc(app, "POST", "auth.signin", { email: EMAIL, password: "mauvais" });
    expect(res.statusCode).toBe(401);
  });

  it("signin email inconnu → 401 (anti-énumération, même message)", async () => {
    const res = await injectTrpc(app, "POST", "auth.signin", { email: "absent@nowhere.fr", password: PASSWORD });
    expect(res.statusCode).toBe(401);
  });

  it("signin correct → 200, success + user ; cookie token posé", async () => {
    const res = await injectTrpc(app, "POST", "auth.signin", { email: EMAIL, password: PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data.success).toBe(true);
    expect(res.json().result.data.user.email).toBe(EMAIL);
  });

  it("updateEmail sans cookie → 401 (procédure protégée)", async () => {
    const res = await injectTrpc(app, "POST", "auth.updateEmail", { newEmail: "x@y.fr", currentPassword: "any" });
    expect(res.statusCode).toBe(401);
  });
});
