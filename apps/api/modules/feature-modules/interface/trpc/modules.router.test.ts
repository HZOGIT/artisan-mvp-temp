import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9953241;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `modules.*`) : catalogue de modules + activation + onboarding (protégé).
describe.skipIf(!URL)("modules.router e2e (feature-modules protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Modules SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("list sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "modules.list", undefined)).statusCode).toBe(401);
  });

  it("list / getMine / getOnboardingStatus (cookie) → 200", async () => {
    const tok = await jwt(UID);
    for (const proc of ["modules.list", "modules.getMine", "modules.getOnboardingStatus"]) {
      expect((await injectTrpc(app, "GET", proc, undefined, tok)).statusCode, proc).toBe(200);
    }
  });

  it("validation : toggle sans `actif` (booléen requis) → 400", async () => {
    const res = await injectTrpc(app, "POST", "modules.toggle", { slug: "devis" }, await jwt(UID));
    expect(res.statusCode).toBe(400);
  });
});
