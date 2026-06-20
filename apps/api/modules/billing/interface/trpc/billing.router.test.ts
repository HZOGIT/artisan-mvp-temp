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

  it("getBillingInfo shape complète : recentInvoices présent dans la réponse HTTP", async () => {
    // recentInvoices n'était jamais vérifié à L3 — seuls subscription et paymentMethods l'étaient.
    // Ce test garantit que la sérialisation superjson inclut bien le champ dans la réponse.
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "GET", "billing.getBillingInfo", undefined, tok);
    expect(res.statusCode).toBe(200);
    const data = res.json().result.data as {
      subscription: unknown;
      paymentMethods: unknown[];
      recentInvoices: unknown[];
    };
    expect(Array.isArray(data.recentInvoices)).toBe(true);
    expect(data.recentInvoices).toHaveLength(0);
  });

  it("validations Zod → 400 (schémas respectés avant d'atteindre le use-case)", async () => {
    const tok = await jwt(UID);
    // paymentMethodId doit être entier positif strict (> 0)
    expect((await injectTrpc(app, "POST", "billing.revokePaymentMethod", { paymentMethodId: 0 }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "billing.revokePaymentMethod", { paymentMethodId: -1 }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "billing.setDefaultPaymentMethod", { paymentMethodId: 0 }, tok)).statusCode).toBe(400);
    // stripePaymentMethodId et stripeCustomerId doivent être non-vides (min(1))
    expect((await injectTrpc(app, "POST", "billing.confirmPaymentMethod", { stripePaymentMethodId: "", stripeCustomerId: "cus_x", setAsDefault: true }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "billing.confirmPaymentMethod", { stripePaymentMethodId: "pm_x", stripeCustomerId: "", setAsDefault: true }, tok)).statusCode).toBe(400);
    // setAsDefault doit être un booléen strict — un string ou un number est rejeté
    expect((await injectTrpc(app, "POST", "billing.confirmPaymentMethod", { stripePaymentMethodId: "pm_x", stripeCustomerId: "cus_x", setAsDefault: "oui" }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "billing.confirmPaymentMethod", { stripePaymentMethodId: "pm_x", stripeCustomerId: "cus_x", setAsDefault: 1 }, tok)).statusCode).toBe(400);
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

  it("revokePaymentMethod : event payment_method.revoked persisté en DB (audit trail complet)", async () => {
    // Vérifie la chaîne complète HTTP → use-case → repo.appendEvent → billing_events.
    // Les tests 200 + PM disparaît de getBillingInfo prouvent le chemin positif,
    // mais pas que l'événement d'audit est bien stocké (event sourcing / scheduler zombie recovery).
    const { rows } = await admin.query<{ id: number }>(
      `insert into billing_payment_methods
         (artisan_id, stripe_customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, consented_at)
       values ($1,'cus_evt','pm_evt_audit','amex','0005',3,2029,false,now())
       returning id`,
      [ARTISAN_ID],
    );
    const pmEvtId = rows[0]!.id;

    const tok = await jwt(UID);
    const res = await injectTrpc(app, "POST", "billing.revokePaymentMethod", { paymentMethodId: pmEvtId }, tok);
    expect(res.statusCode).toBe(200);

    const { rows: evts } = await admin.query<{ entity_id: number; event_type: string; actor: string }>(
      "select entity_id, event_type, actor from billing_events where entity_id=$1 and event_type='payment_method.revoked'",
      [pmEvtId],
    );
    expect(evts).toHaveLength(1);
    expect(evts[0]!.actor).toBe(`user:${UID}`);
  });

  it("FIX-CDS — cancelAtPeriodEnd + reactivate : cancel_at positionné puis effacé", async () => {
    const tok = await jwt(UID);

    /* Assure une sub active sans cancel_at */
    await admin.query(
      `insert into billing_subscriptions (artisan_id, plan_id, billing_mode, status, current_period_end)
       values ($1,'starter','maison','active','2026-08-01')
       on conflict (artisan_id) do update set status='active', cancel_at=null, plan_id='starter'`,
      [ARTISAN_ID],
    );

    const cancel = await injectTrpc(app, "POST", "billing.cancelAtPeriodEnd", undefined, tok);
    expect(cancel.statusCode).toBe(200);
    const { rows: afterCancel } = await admin.query<{ cancel_at: unknown }>(
      "select cancel_at from billing_subscriptions where artisan_id=$1", [ARTISAN_ID],
    );
    expect(afterCancel[0]!.cancel_at).not.toBeNull();

    const reactivate = await injectTrpc(app, "POST", "billing.reactivate", undefined, tok);
    expect(reactivate.statusCode).toBe(200);
    const { rows: afterReact } = await admin.query<{ cancel_at: unknown }>(
      "select cancel_at from billing_subscriptions where artisan_id=$1", [ARTISAN_ID],
    );
    expect(afterReact[0]!.cancel_at).toBeNull();
  });

  it("FIX-CDS — changePlan → plan_id mis à jour en DB", async () => {
    const tok = await jwt(UID);
    await admin.query(
      `insert into billing_subscriptions (artisan_id, plan_id, billing_mode, status)
       values ($1,'starter','maison','active')
       on conflict (artisan_id) do update set status='active', plan_id='starter'`,
      [ARTISAN_ID],
    );

    const res = await injectTrpc(app, "POST", "billing.changePlan", { planId: "pro" }, tok);
    expect(res.statusCode).toBe(200);

    const { rows } = await admin.query<{ plan_id: string }>(
      "select plan_id from billing_subscriptions where artisan_id=$1", [ARTISAN_ID],
    );
    expect(rows[0]!.plan_id).toBe("pro");
  });

  it("setDefaultPaymentMethod : event payment_method.set_default persisté en DB", async () => {
    // Symétrique avec le test revoke : vérifie que setDefaultPaymentMethod écrit aussi en billing_events.
    const { rows } = await admin.query<{ id: number }>(
      `insert into billing_payment_methods
         (artisan_id, stripe_customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, consented_at)
       values ($1,'cus_evt2','pm_evt_def','visa','5555',1,2030,false,now())
       returning id`,
      [ARTISAN_ID],
    );
    const pmDefId = rows[0]!.id;

    const tok = await jwt(UID);
    const res = await injectTrpc(app, "POST", "billing.setDefaultPaymentMethod", { paymentMethodId: pmDefId }, tok);
    expect(res.statusCode).toBe(200);

    const { rows: evts } = await admin.query<{ entity_id: number; event_type: string; actor: string }>(
      "select entity_id, event_type, actor from billing_events where entity_id=$1 and event_type='payment_method.set_default'",
      [pmDefId],
    );
    expect(evts).toHaveLength(1);
    expect(evts[0]!.actor).toBe(`user:${UID}`);
  });
});
