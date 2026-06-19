import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeStripePort } from "../../../../shared/ports/stripe-adapter";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9939201;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

// L3 e2e — câblage HTTP → tRPC `billing.*`.
// Vérifie : guard d'auth (401 sans cookie), routage des procédures (200/404 attendus).
// La logique métier est couverte à L1 (billing-use-cases.test.ts + FakeBillingPort).
describe.skipIf(!URL)("billing.router e2e (billing maison protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query(
      "insert into users (id, email, password, role) values ($1,$2,'x','artisan')",
      [UID, `u${UID}@t.fr`],
    );
    app = buildApp({ jwtSecret: SECRET, stripePort: new FakeStripePort() });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("toutes les procédures sans cookie → 401", async () => {
    const procs: Array<["GET" | "POST", string, unknown]> = [
      ["POST", "billing.createSetupIntent", undefined],
      ["POST", "billing.confirmPaymentMethod", { stripePaymentMethodId: "pm_x", stripeCustomerId: "cus_x", setAsDefault: true }],
      ["POST", "billing.revokePaymentMethod", { paymentMethodId: 1 }],
      ["POST", "billing.setDefaultPaymentMethod", { paymentMethodId: 1 }],
      ["GET",  "billing.getBillingInfo", undefined],
    ];
    for (const [method, path, input] of procs) {
      const res = await injectTrpc(app, method, path, input);
      expect(res.statusCode, `${path} doit être 401 sans token`).toBe(401);
    }
  });

  it("getBillingInfo (cookie) → 200, aucune donnée par défaut", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "GET", "billing.getBillingInfo", undefined, tok);
    expect(res.statusCode).toBe(200);
    const data = res.json().result.data as { subscription: unknown; paymentMethods: unknown[] };
    expect(data.subscription).toBeNull();
    expect(data.paymentMethods).toEqual([]);
  });

  it("revokePaymentMethod (cookie) sur id inexistant → 404", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "POST", "billing.revokePaymentMethod", { paymentMethodId: 99999 }, tok);
    expect(res.statusCode).toBe(404);
  });

  it("setDefaultPaymentMethod (cookie) sur id inexistant → 404", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "POST", "billing.setDefaultPaymentMethod", { paymentMethodId: 99999 }, tok);
    expect(res.statusCode).toBe(404);
  });
});
