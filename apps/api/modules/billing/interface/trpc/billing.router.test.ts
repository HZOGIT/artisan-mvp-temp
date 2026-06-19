import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeStripePort } from "../../../../shared/ports/stripe-adapter";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
/** userId injecté dans le JWT */
const UID = 9939201;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

// L3 e2e — câblage HTTP → tRPC `billing.*`.
// Vérifie : guard d'auth (401 sans cookie), routage des procédures (200/404 attendus),
// chemins positifs pour les procédures repo-only (getBillingInfo, revokePaymentMethod,
// setDefaultPaymentMethod).
//
// Note : createSetupIntent et confirmPaymentMethod appellent BillingAdapter (Stripe réel).
// Ces tests sont bloqués jusqu'à l'ajout d'un `billingPort` override dans AppDeps — voir
// docs/billing/journal-refonte-billing.md.
//
// Note auth : DrizzleTenantResolver résout `artisanId` = artisans.id (NOT users.id).
// Le beforeAll insère donc dans `users` ET `artisans` ; les données billing utilisent
// `artisans.id` comme artisan_id (capturé dans la variable ARTISAN_ID).
describe.skipIf(!URL)("billing.router e2e (billing maison protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  /** artisans.id du test user — résolu après insertion dans beforeAll */
  let ARTISAN_ID: number;

  /** Supprime les données billing pour le tenant test (utilise userId pour retrouver l'artisanId) */
  const cleanupBilling = async () => {
    const { rows } = await admin.query<{ id: number }>('select id from artisans where "userId"=$1', [UID]);
    if (rows.length === 0) return;
    const aid = rows[0]!.id;
    await admin.query(
      "update billing_subscriptions set payment_method_id=null, status='trialing' where artisan_id=$1",
      [aid],
    );
    await admin.query("delete from billing_subscriptions where artisan_id=$1", [aid]);
    await admin.query("delete from billing_payment_methods where artisan_id=$1", [aid]);
  };

  const cleanupUser = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanupBilling();
    await cleanupUser();
    await admin.query(
      "insert into users (id, email, password, role) values ($1,$2,'x','artisan')",
      [UID, `u${UID}@t.fr`],
    );
    const { rows } = await admin.query<{ id: number }>(
      'insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id',
      [UID, "Billing E2E"],
    );
    ARTISAN_ID = rows[0]!.id;
    app = buildApp({ jwtSecret: SECRET, stripePort: new FakeStripePort() });
  });

  afterAll(async () => {
    await app?.close();
    await cleanupBilling();
    await cleanupUser();
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

  // ── Chemins positifs (repo-only, pas d'appel Stripe) ────────────────────────

  describe("avec PM et subscription réels", () => {
    let pmId: number;
    let pm2Id: number;

    beforeAll(async () => {
      // PM active (default) pour test getBillingInfo + revokePaymentMethod
      const { rows: r1 } = await admin.query<{ id: number }>(
        `insert into billing_payment_methods
           (artisan_id, stripe_customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, consented_at)
         values ($1,'cus_l3','pm_l3_rev','visa','4242',12,2028,true,now())
         returning id`,
        [ARTISAN_ID],
      );
      pmId = r1[0]!.id;

      // PM non-default pour test setDefaultPaymentMethod
      const { rows: r2 } = await admin.query<{ id: number }>(
        `insert into billing_payment_methods
           (artisan_id, stripe_customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, consented_at)
         values ($1,'cus_l3','pm_l3_def','mastercard','1234',6,2030,false,now())
         returning id`,
        [ARTISAN_ID],
      );
      pm2Id = r2[0]!.id;

      // Subscription trialing
      await admin.query(
        `insert into billing_subscriptions (artisan_id, plan_id, billing_mode, status, current_period_start, current_period_end)
         values ($1,'starter','maison','trialing','2026-06-01','2026-07-01')
         on conflict (artisan_id) do update set plan_id='starter', status='trialing', payment_method_id=null`,
        [ARTISAN_ID],
      );
    });

    it("getBillingInfo → 200 avec PM et subscription réels", async () => {
      const tok = await jwt(UID);
      const res = await injectTrpc(app, "GET", "billing.getBillingInfo", undefined, tok);
      expect(res.statusCode).toBe(200);
      const data = res.json().result.data as {
        subscription: { plan_id: string } | null;
        paymentMethods: Array<{ id: number; last4: string }>;
      };
      expect(data.subscription?.plan_id).toBe("starter");
      expect(data.paymentMethods.length).toBe(2);
      expect(data.paymentMethods.some((p) => p.last4 === "4242")).toBe(true);
    });

    it("revokePaymentMethod → 200, PM disparaît de getBillingInfo", async () => {
      const tok = await jwt(UID);
      const res = await injectTrpc(app, "POST", "billing.revokePaymentMethod", { paymentMethodId: pmId }, tok);
      expect(res.statusCode).toBe(200);

      const info = await injectTrpc(app, "GET", "billing.getBillingInfo", undefined, tok);
      const pms = info.json().result.data.paymentMethods as Array<{ id: number }>;
      expect(pms.some((p) => p.id === pmId)).toBe(false);
    });

    it("setDefaultPaymentMethod → 200, pm2 promu default", async () => {
      const tok = await jwt(UID);
      const res = await injectTrpc(app, "POST", "billing.setDefaultPaymentMethod", { paymentMethodId: pm2Id }, tok);
      expect(res.statusCode).toBe(200);

      const info = await injectTrpc(app, "GET", "billing.getBillingInfo", undefined, tok);
      const pms = info.json().result.data.paymentMethods as Array<{ id: number; is_default: boolean }>;
      const target = pms.find((p) => p.id === pm2Id);
      expect(target?.is_default).toBe(true);
    });
  });
});
