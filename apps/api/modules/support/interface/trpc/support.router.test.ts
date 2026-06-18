import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeEmailPort } from "../../../../shared/ports/fakes";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9958291;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

const valid = { nom: "Jean Test", email: "jean@example.com", sujet: "technique", message: "Bonjour, j'ai un souci technique." };

// L3 e2e (HTTP → tRPC `support.contact`) : formulaire de contact (authentifié, anti-flood + email équipe).
describe.skipIf(!URL)("support.router e2e (contact protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Support SARL"]);
    // emailPort faké : `contact` envoie un email à l'équipe → éviter l'adaptateur réel.
    app = buildApp({ jwtSecret: SECRET, emailPort: new FakeEmailPort() });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("contact sans cookie → 401", async () => {
    expect((await injectTrpc(app, "POST", "support.contact", valid)).statusCode).toBe(401);
  });

  it("contact (cookie) valide → 200", async () => {
    const res = await injectTrpc(app, "POST", "support.contact", valid, await jwt(UID));
    expect(res.statusCode).toBe(200);
  });

  it("validation : message < 10 → 400 ; sujet hors enum → 400 ; email invalide → 400", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "POST", "support.contact", { ...valid, message: "court" }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "support.contact", { ...valid, sujet: "spam" }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "support.contact", { ...valid, email: "pas-un-email" }, tok)).statusCode).toBe(400);
  });
});
