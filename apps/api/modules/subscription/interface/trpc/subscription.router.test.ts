import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeStripePort } from "../../../../shared/ports/stripe-adapter";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9939101;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `subscription.*`). Surface BILLING entièrement protégée (cookie artisan).
// La logique des effets Stripe est couverte à L1 (effects.test.ts, FakeStripePort + prix explicites) ;
// ici on prouve le câblage HTTP + la garde d'auth + le mapping d'erreur NotFound→404.
describe.skipIf(!URL)("subscription.router e2e (billing protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, `u${UID}@t.fr`]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Abo E2E"]);
    app = buildApp({ jwtSecret: SECRET, stripePort: new FakeStripePort() });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("toutes les procédures sans cookie → 401 (billing protégé)", async () => {
    expect((await injectTrpc(app, "GET", "subscription.getCurrent", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "billing.createSetupIntent", {})).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "billing.cancelAtPeriodEnd", {})).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "billing.reactivate", {})).statusCode).toBe(401);
    expect((await injectTrpc(app, "GET", "billing.getBillingInfo", undefined)).statusCode).toBe(401);
  });

  it("getCurrent (cookie) → 200, état par défaut (aucun abonnement → plan trial/trialing)", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "GET", "subscription.getCurrent", undefined, tok);
    expect(res.statusCode).toBe(200);
    const data = res.json().result.data as { plan: string; status: string };
    expect(data.plan).toBe("trial");
    expect(data.status).toBe("trialing");
  });

  it("createPortal (cookie) sans Customer Stripe → 404 (NotFound mappé)", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "POST", "subscription.createPortal", {}, tok);
    expect(res.statusCode).toBe(404);
  });

  it("cancel (cookie) sans abonnement Stripe → 404", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "POST", "subscription.cancel", {}, tok);
    expect(res.statusCode).toBe(404);
  });
});
