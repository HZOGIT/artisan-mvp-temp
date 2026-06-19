import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { BillingRepositoryDrizzle } from "./billing-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Artisans fictifs dédiés à ces tests (hors plage des fixtures normales).
const A = 997901;
const B = 997902;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

// ⚠️ Les tables billing_* sont HORS RLS → scope EXPLICITE par artisan_id dans le repo.
// Ce test vérifie que le scope est bien appliqué (isolation cross-tenant) via app_tenant.
describe.skipIf(!URL)("BillingRepositoryDrizzle (PG, scope explicite artisan_id)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new BillingRepositoryDrizzle(app.db);

  const cleanup = async () => {
    // FK order : invoices → cycles → nullify sub.payment_method_id → subs → payment_methods
    await admin.query("delete from billing_invoices where artisan_id in ($1,$2)", [A, B]);
    await admin.query(
      "delete from billing_cycles where subscription_id in (select id from billing_subscriptions where artisan_id in ($1,$2))",
      [A, B],
    );
    // chk_pm_required : nullifier PM exige status=trialing (les deux en un UPDATE atomique)
    await admin.query(
      "update billing_subscriptions set status='trialing', payment_method_id=null where artisan_id in ($1,$2)",
      [A, B],
    );
    await admin.query("delete from billing_subscriptions where artisan_id in ($1,$2)", [A, B]);
    await admin.query("delete from billing_payment_methods where artisan_id in ($1,$2)", [A, B]);
    await admin.query(
      "delete from billing_events where entity_type='artisan' and entity_id in ($1,$2)",
      [A, B],
    );
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  // ── Moyens de paiement ────────────────────────────────────────────────────

  it("savePaymentMethod + listPaymentMethods scopé au tenant", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_drizzle_test",
      stripePaymentMethodId: "pm_drizzle_test",
      brand: "visa",
      last4: "1234",
      expMonth: 12,
      expYear: 2028,
      consentedAt: new Date(),
    });
    expect(pm.id).toBeGreaterThan(0);
    expect(pm.artisan_id).toBe(A);
    expect(pm.last4).toBe("1234");

    const list = await repo.listPaymentMethods(ctx(A));
    expect(list.some((p) => p.id === pm.id)).toBe(true);

    // Tenant B ne voit pas la carte de A
    const listB = await repo.listPaymentMethods(ctx(B));
    expect(listB.some((p) => p.id === pm.id)).toBe(false);
  });

  it("savePaymentMethod : consented_at persisté en DB (RGPD — preuve de consentement MIT)", async () => {
    // consented_at documente le moment où l'utilisateur a consenti aux prélèvements automatiques
    // (MIT = Merchant-Initiated Transactions). Ce champ est l'unique preuve de consentement.
    // S'il est silencieusement supprimé par Drizzle, l'audit trail RGPD est cassé et les
    // chargements off-session ne seraient plus défendables en cas de litige Stripe.
    const consentedAt = new Date("2026-07-01T14:30:00.000Z");
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_consent_chk",
      stripePaymentMethodId: "pm_consent_chk",
      brand: "visa",
      last4: "9999",
      expMonth: 6,
      expYear: 2029,
      consentedAt,
    });
    const found = await repo.findPaymentMethodById(ctx(A), pm.id);
    expect(found?.consented_at).not.toBeNull();
    expect(new Date(found!.consented_at!).toISOString().slice(0, 16)).toBe("2026-07-01T14:30");
  });

  it("savePaymentMethod : shape complète round-trip — exp_month/exp_year/brand/stripe_payment_method_id/stripe_customer_id (scheduler MIT)", async () => {
    // Le scheduler Phase 2 lit stripe_payment_method_id + stripe_customer_id pour construire
    // le PaymentIntent off-session (billing.createPaymentIntent). Il lit exp_month/exp_year
    // pour détecter les cartes expirées et les exclure du dunning. Si Drizzle perd l'un
    // de ces champs, le scheduler échouerait silencieusement avec une clé Stripe invalide.
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_shape_chk",
      stripePaymentMethodId: "pm_shape_chk",
      brand: "amex",
      last4: "0001",
      expMonth: 3,
      expYear: 2031,
      consentedAt: new Date(),
    });
    const found = await repo.findPaymentMethodById(ctx(A), pm.id);
    expect(found?.stripe_payment_method_id).toBe("pm_shape_chk");
    expect(found?.stripe_customer_id).toBe("cus_shape_chk");
    expect(found?.brand).toBe("amex");
    expect(found?.exp_month).toBe(3);
    expect(found?.exp_year).toBe(2031);
  });

  it("setDefaultPaymentMethod + findDefaultPaymentMethod", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_drizzle_test2",
      stripePaymentMethodId: "pm_drizzle_def",
      brand: "mastercard",
      last4: "5678",
      expMonth: 6,
      expYear: 2027,
      consentedAt: new Date(),
    });
    await repo.setDefaultPaymentMethod(ctx(A), pm.id);
    const def = await repo.findDefaultPaymentMethod(ctx(A));
    expect(def?.id).toBe(pm.id);

    // Tenant B n'a pas de défaut
    expect(await repo.findDefaultPaymentMethod(ctx(B))).toBeNull();
  });

  it("revokePaymentMethod → disparaît de listPaymentMethods", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_revoke",
      stripePaymentMethodId: "pm_revoke",
      brand: "visa",
      last4: "9999",
      expMonth: 1,
      expYear: 2026,
      consentedAt: new Date(),
    });
    await repo.revokePaymentMethod(ctx(A), pm.id);
    const list = await repo.listPaymentMethods(ctx(A));
    expect(list.some((p) => p.id === pm.id)).toBe(false);
  });

  it("revokePaymentMethod sur la carte default → findDefaultPaymentMethod retourne null", async () => {
    // revokePaymentMethod pose is_default=false (en plus de revoked_at).
    // findDefaultPaymentMethod filtre is_default=true → null après révocation.
    // Note : le fake BillingRepository filtre aussi revoked_at IS NULL ; le vrai Drizzle
    // ne filtre que is_default=true. Les deux convergent parce que revoke pose is_default=false.
    const pm = await repo.savePaymentMethod({
      artisanId: B,
      stripeCustomerId: "cus_def_revoke",
      stripePaymentMethodId: "pm_def_revoke",
      brand: "visa",
      last4: "8888",
      expMonth: 6,
      expYear: 2030,
      consentedAt: new Date(),
    });
    await repo.setDefaultPaymentMethod(ctx(B), pm.id);
    expect((await repo.findDefaultPaymentMethod(ctx(B)))?.id).toBe(pm.id);

    await repo.revokePaymentMethod(ctx(B), pm.id);
    expect(await repo.findDefaultPaymentMethod(ctx(B))).toBeNull();
  });

  it("findPaymentMethodById : A peut lire sa carte, B ne la voit pas", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_find",
      stripePaymentMethodId: "pm_find",
      brand: "amex",
      last4: "0001",
      expMonth: 3,
      expYear: 2029,
      consentedAt: new Date(),
    });
    expect((await repo.findPaymentMethodById(ctx(A), pm.id))?.id).toBe(pm.id);
    expect(await repo.findPaymentMethodById(ctx(B), pm.id)).toBeNull();
  });

  it("findPaymentMethodById : retourne une PM révoquée (pas de filtre revoked_at) — contrat idempotence double-revoke", async () => {
    // findPaymentMethodById ne filtre PAS revoked_at (contrairement à listPaymentMethods).
    // Ceci est intentionnel : revokePaymentMethod appelle findPaymentMethodById avant de révoquer,
    // ce qui rend le double-revoke idempotent (pas de NotFoundError au 2e appel).
    // Ce test documente et protège ce contrat à DB level.
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_revoked_find",
      stripePaymentMethodId: "pm_revoked_find",
      brand: "visa",
      last4: "7777",
      expMonth: 9,
      expYear: 2029,
      consentedAt: new Date(),
    });
    await repo.revokePaymentMethod(ctx(A), pm.id);
    // Après révocation : listPaymentMethods ne voit plus la carte...
    expect(await repo.listPaymentMethods(ctx(A)).then(l => l.some(p => p.id === pm.id))).toBe(false);
    // ...mais findPaymentMethodById la retourne toujours (revoked_at non filtré)
    const found = await repo.findPaymentMethodById(ctx(A), pm.id);
    expect(found?.id).toBe(pm.id);
    expect(found?.revoked_at).toBeTruthy();
  });

  // ── Abonnements ──────────────────────────────────────────────────────────

  it("saveSubscription + findSubscription scopé au tenant", async () => {
    // chk_pm_required : trialing est le seul statut valide sans payment_method_id
    const sub = await repo.saveSubscription({
      artisanId: A,
      planId: "starter",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: new Date("2026-06-01"),
      currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: new Date("2026-06-15"),
      paymentMethodId: null,
    });
    expect(sub.artisan_id).toBe(A);
    expect((await repo.findSubscription(ctx(A)))?.id).toBe(sub.id);
    expect(await repo.findSubscription(ctx(B))).toBeNull();
  });

  // ── Cycles ────────────────────────────────────────────────────────────────

  it("createCycle shape complète : amount_cents / period_start / period_end / currency retournés", async () => {
    // Le scheduler Phase 2 lit ces champs pour savoir quoi prélever et sur quelle période.
    // Un bug de coercition de date ou de type Drizzle ferait charger le mauvais montant.
    const sub = await repo.saveSubscription({
      artisanId: B,
      planId: "pro",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: new Date("2026-10-01"),
      currentPeriodEnd: new Date("2026-11-01"),
      trialEndsAt: null,
      paymentMethodId: null,
    });
    const cycle = await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-10-01"),
      periodEnd: new Date("2026-11-01"),
      amountCents: 4900,
      currency: "eur",
    });
    expect(cycle.amount_cents).toBe(4900);
    expect(cycle.currency).toBe("eur");
    expect(new Date(cycle.period_start).toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(new Date(cycle.period_end).toISOString().slice(0, 10)).toBe("2026-11-01");
    // Marquer paid immédiatement pour ne pas parasiter findPendingCycle dans les tests suivants
    // (saveSubscription utilise onConflictDoUpdate → sub.id réutilisé par tous les tests sur B)
    await admin.query("update billing_cycles set status='paid' where id=$1", [cycle.id]);
  });

  it("createCycle + findPendingCycle : retourne le cycle pending de la subscription", async () => {
    const sub = await repo.saveSubscription({
      artisanId: A,
      planId: "pro",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: new Date("2026-07-01"),
      currentPeriodEnd: new Date("2026-08-01"),
      trialEndsAt: new Date("2026-07-15"),
      paymentMethodId: null,
    });

    const cycle = await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-08-01"),
      amountCents: 2900,
      currency: "eur",
    });

    expect(cycle.id).toBeGreaterThan(0);
    expect(cycle.status).toBe("pending");
    expect(cycle.subscription_id).toBe(sub.id);

    const found = await repo.findPendingCycle(sub.id);
    expect(found?.id).toBe(cycle.id);
  });

  it("findPendingCycle : plusieurs cycles pending → retourne le plus récent (orderBy period_start DESC)", async () => {
    // Si deux cycles pending existent pour la même sub (ex. backfill ou bug de scheduler),
    // findPendingCycle retourne le plus récent. Documente le comportement de tri.
    const sub = await repo.saveSubscription({
      artisanId: A,
      planId: "starter",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: new Date("2026-09-01"),
      currentPeriodEnd: new Date("2026-10-01"),
      trialEndsAt: null,
      paymentMethodId: null,
    });
    const older = await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-09-01"),
      periodEnd: new Date("2026-10-01"),
      amountCents: 2900,
      currency: "eur",
    });
    const newer = await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-10-01"),
      periodEnd: new Date("2026-11-01"),
      amountCents: 2900,
      currency: "eur",
    });
    const found = await repo.findPendingCycle(sub.id);
    expect(found?.id).toBe(newer.id);
    expect(found?.id).not.toBe(older.id);
  });

  it("findPendingCycle : null si aucun cycle pending (status paid)", async () => {
    const sub = await repo.saveSubscription({
      artisanId: B,
      planId: "starter",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: new Date("2026-07-01"),
      currentPeriodEnd: new Date("2026-08-01"),
      trialEndsAt: new Date("2026-07-15"),
      paymentMethodId: null,
    });

    // Créer un cycle puis le marquer paid via admin
    const cycle = await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-08-01"),
      amountCents: 990,
      currency: "eur",
    });
    await admin.query("update billing_cycles set status='paid' where id=$1", [cycle.id]);

    expect(await repo.findPendingCycle(sub.id)).toBeNull();
  });

  // ── Mise à jour abonnement ────────────────────────────────────────────────

  it("updateSubscriptionStatus : passe de trialing → active (avec PM) sans toucher B", async () => {
    // Lier d'abord une PM à la sub de A pour satisfaire chk_pm_required lors du passage à active
    const pmA = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_status_test",
      stripePaymentMethodId: "pm_status_test",
      brand: "visa",
      last4: "1111",
      expMonth: 1,
      expYear: 2030,
      consentedAt: new Date(),
    });
    await repo.updateSubscriptionPaymentMethod(ctx(A), pmA.id);

    await repo.updateSubscriptionStatus(ctx(A), "active");
    expect((await repo.findSubscription(ctx(A)))?.status).toBe("active");

    // B reste trialing (non modifié)
    expect((await repo.findSubscription(ctx(B)))?.status).toBe("trialing");
  });

  it("updateSubscriptionPaymentMethod : lie la PM à l'abonnement du bon tenant", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: B,
      stripeCustomerId: "cus_link_b",
      stripePaymentMethodId: "pm_link_b",
      brand: "mastercard",
      last4: "2222",
      expMonth: 6,
      expYear: 2028,
      consentedAt: new Date(),
    });

    await repo.updateSubscriptionPaymentMethod(ctx(B), pm.id);
    expect((await repo.findSubscription(ctx(B)))?.payment_method_id).toBe(pm.id);

    // A inchangé (son PM a été lié dans le test précédent, pas celui de B)
    const subA = await repo.findSubscription(ctx(A));
    expect(subA?.payment_method_id).not.toBe(pm.id);
  });

  // ── Factures ──────────────────────────────────────────────────────────────

  it("findInvoicesByArtisan : retourne les factures du tenant, triées par date desc", async () => {
    // Insertion via admin (les factures sont créées par le scheduler, pas par le repo)
    await admin.query(
      `insert into billing_invoices (artisan_id, type, status, subtotal_cents, tax_cents, total_cents, currency)
       values ($1,'subscription','draft',2900,0,2900,'eur'), ($1,'subscription','draft',2900,0,2900,'eur')`,
      [A],
    );
    await admin.query(
      `insert into billing_invoices (artisan_id, type, status, subtotal_cents, tax_cents, total_cents, currency)
       values ($1,'subscription','draft',990,0,990,'eur')`,
      [B],
    );

    const invoicesA = await repo.findInvoicesByArtisan(ctx(A));
    expect(invoicesA.every((i) => i.artisan_id === A)).toBe(true);
    expect(invoicesA.length).toBeGreaterThanOrEqual(2);

    // Isolation : B ne voit pas celles de A
    const invoicesB = await repo.findInvoicesByArtisan(ctx(B));
    expect(invoicesB.every((i) => i.artisan_id === B)).toBe(true);
    expect(invoicesB.length).toBe(1);
  });

  it("findInvoicesByArtisan : respecte le paramètre limit", async () => {
    const limited = await repo.findInvoicesByArtisan(ctx(A), 1);
    expect(limited.length).toBe(1);
  });

  it("findInvoicesByArtisan : triées par created_at DESC — la plus récente d'abord", async () => {
    // Les tests précédents ont déjà inséré des factures pour A via NOW().
    // On insère une facture explicitement datée d'il y a 2 jours pour garantir qu'elle apparaît APRÈS.
    await admin.query(
      `insert into billing_invoices
         (artisan_id, type, status, subtotal_cents, tax_cents, total_cents, currency, created_at)
       values ($1, 'subscription', 'draft', 500, 0, 500, 'eur', NOW() - INTERVAL '2 days')`,
      [A],
    );
    const invoices = await repo.findInvoicesByArtisan(ctx(A));
    // Toutes les factures de A doivent être triées DESC : chaque date >= celle qui suit
    for (let i = 0; i < invoices.length - 1; i++) {
      const curr = new Date(invoices[i]!.created_at).getTime();
      const next = new Date(invoices[i + 1]!.created_at).getTime();
      expect(curr).toBeGreaterThanOrEqual(next);
    }
    // La plus ancienne (500 cts insérée il y a 2 jours) est en dernier
    const oldest = invoices.at(-1)!;
    expect(oldest.total_cents).toBe(500);
  });

  // ── Stripe customer ID ────────────────────────────────────────────────────

  it("findStripeCustomerId : retourne le customer ID du PM le plus récent (saveStripeCustomerId est no-op)", async () => {
    // saveStripeCustomerId est intentionnellement no-op : le customer ID est porté par chaque PM.
    // findStripeCustomerId cherche dans billing_payment_methods (puis fallback legacy subscriptions).
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_canonical",
      stripePaymentMethodId: "pm_canonical",
      brand: "visa",
      last4: "3333",
      expMonth: 12,
      expYear: 2031,
      consentedAt: new Date(),
    });

    // Après insertion d'un PM pour A avec cus_canonical, findStripeCustomerId doit le retourner.
    expect(await repo.findStripeCustomerId(A)).toBe("cus_canonical");
    // Artisan sans aucun PM → null
    expect(await repo.findStripeCustomerId(99999)).toBeNull();
  });

  it("saveStripeCustomerId est no-op : n'écrase pas le customer ID porté par les PMs", async () => {
    // saveStripeCustomerId ne doit rien écrire en DB — le customer ID vit sur billing_payment_methods.
    // Si quelqu'un rend cette méthode non-no-op, findStripeCustomerId doit continuer à retourner
    // la valeur portée par le PM (cus_canonical) et non une valeur externe injectée.
    await repo.saveStripeCustomerId(A, "cus_should_be_ignored");
    expect(await repo.findStripeCustomerId(A)).toBe("cus_canonical"); // inchangé
  });

  it("findStripeCustomerId : fallback table subscriptions legacy (migration billing Stripe → maison)", async () => {
    // Artisan C : aucun billing_payment_methods, mais a un stripe_customer_id dans la table legacy.
    // createSetupIntent l'utilise pour éviter de créer un doublon Stripe customer.
    const C = 997903;
    await admin.query(
      "insert into subscriptions (artisan_id, stripe_customer_id) values ($1,$2) on conflict (artisan_id) do update set stripe_customer_id=$2",
      [C, "cus_legacy_fallback"],
    );
    try {
      expect(await repo.findStripeCustomerId(C)).toBe("cus_legacy_fallback");
    } finally {
      await admin.query("delete from subscriptions where artisan_id=$1", [C]);
    }
  });

  it("findStripeCustomerId : PM maison prioritaire sur subscription legacy (même artisan)", async () => {
    // Si un artisan a à la fois un PM maison et une subscription legacy avec des customer IDs
    // différents, c'est le PM maison qui gagne (priorité 1).
    const C = 997903;
    await admin.query(
      "insert into subscriptions (artisan_id, stripe_customer_id) values ($1,$2) on conflict (artisan_id) do update set stripe_customer_id=$2",
      [C, "cus_legacy_should_be_ignored"],
    );
    try {
      // Insérer un PM maison pour C avec un customer ID différent
      await repo.savePaymentMethod({
        artisanId: C,
        stripeCustomerId: "cus_maison_wins",
        stripePaymentMethodId: "pm_priority_test",
        brand: "visa",
        last4: "0000",
        expMonth: 1,
        expYear: 2032,
        consentedAt: new Date(),
      });
      expect(await repo.findStripeCustomerId(C)).toBe("cus_maison_wins");
    } finally {
      await admin.query("delete from billing_payment_methods where artisan_id=$1", [C]);
      await admin.query("delete from subscriptions where artisan_id=$1", [C]);
    }
  });

  it("saveSubscription upsert : 2e appel avec même artisan_id change le plan_id (onConflictDoUpdate)", async () => {
    // La sub de A est déjà en "starter" depuis le test précédent (même transaction cleanup).
    // On rappelle saveSubscription avec planId="pro" pour exercer le chemin upsert.
    const updated = await repo.saveSubscription({
      artisanId: A,
      planId: "pro",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: new Date("2026-08-01"),
      currentPeriodEnd: new Date("2026-09-01"),
      trialEndsAt: null,
      paymentMethodId: null,
    });
    expect(updated.plan_id).toBe("pro");
    // findSubscription confirme la mise à jour (pas de doublon)
    const found = await repo.findSubscription(ctx(A));
    expect(found?.plan_id).toBe("pro");
    expect(found?.id).toBe(updated.id);
  });

  it("saveSubscription : trial_ends_at non-null persiste et round-trippe via findSubscription (coercition Date Drizzle)", async () => {
    // Le scheduler Phase 2 lit trial_ends_at pour décider si l'essai est expiré et s'il faut
    // activer la subscription. Un bug de coercition Drizzle (Date → string ou UTC drift) ferait
    // rater la comparaison et bloquerait l'activation ou la facturerait en double.
    const trialEnd = new Date("2026-09-15T00:00:00.000Z");
    await repo.saveSubscription({
      artisanId: A, planId: "pro", billingMode: "maison", status: "trialing",
      currentPeriodStart: new Date("2026-09-01"), currentPeriodEnd: new Date("2026-10-01"),
      trialEndsAt: trialEnd, paymentMethodId: null,
    });
    const found = await repo.findSubscription(ctx(A));
    expect(found?.trial_ends_at).not.toBeNull();
    expect(new Date(found!.trial_ends_at!).toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("listPaymentMethods : ordre is_default DESC à DB level — carte default en tête", async () => {
    // pm1 → not default ; pm2 → promu default → doit être en premier dans la liste
    const pm1 = await repo.savePaymentMethod({
      artisanId: B,
      stripeCustomerId: "cus_ord_b",
      stripePaymentMethodId: "pm_ord_b1",
      brand: "visa",
      last4: "1111",
      expMonth: 1,
      expYear: 2030,
      consentedAt: new Date(),
    });
    const pm2 = await repo.savePaymentMethod({
      artisanId: B,
      stripeCustomerId: "cus_ord_b",
      stripePaymentMethodId: "pm_ord_b2",
      brand: "mastercard",
      last4: "2222",
      expMonth: 2,
      expYear: 2030,
      consentedAt: new Date(),
    });
    await repo.setDefaultPaymentMethod(ctx(B), pm2.id);

    const list = await repo.listPaymentMethods(ctx(B));
    // pm2 (default) doit précéder pm1 (non-default) — tri is_default DESC
    const idx1 = list.findIndex(p => p.id === pm1.id);
    const idx2 = list.findIndex(p => p.id === pm2.id);
    expect(idx2).toBeLessThan(idx1);
    expect(list.find(p => p.id === pm2.id)?.is_default).toBe(true);
  });

  // ── Événements (append-only) ──────────────────────────────────────────────

  it("appendEvent persiste et est retrouvable", async () => {
    const ev = await repo.appendEvent({
      entityType: "artisan",
      entityId: A,
      eventType: "payment_method.confirmed",
      payload: { pm: "pm_test" },
      actor: "user:1",
    });
    expect(ev.id).toBeGreaterThan(0);
    expect(ev.event_type).toBe("payment_method.confirmed");
    expect(ev.actor).toBe("user:1");
  });

  it("appendEvent : payload JSONB round-trip — les clés imbriquées sont retrouvables (zombie recovery)", async () => {
    // Le scheduler Phase 2 zombie recovery lit payload.setupIntentId depuis billing_events
    // pour réconcilier les SetupIntents orphelins. Si Drizzle ne sérialise pas correctement
    // le JSONB ou tronque les clés, la récupération zombie échoue silencieusement.
    const ev = await repo.appendEvent({
      entityType: "artisan",
      entityId: A,
      eventType: "setup_intent.created",
      payload: { setupIntentId: "seti_test_roundtrip", stripeCustomerId: "cus_zombie_test" },
      actor: "system:scheduler",
    });
    expect(ev.payload).toMatchObject({
      setupIntentId: "seti_test_roundtrip",
      stripeCustomerId: "cus_zombie_test",
    });
    // Vérification depuis la DB via admin (pas seulement le retour INSERT)
    const { rows } = await admin.query<{ payload: Record<string, unknown> }>(
      "select payload from billing_events where id=$1",
      [ev.id],
    );
    expect(rows[0]?.payload).toMatchObject({ setupIntentId: "seti_test_roundtrip" });
  });

  it("updateSubscriptionStatus vers 'active' sans PM → viole chk_pm_required (garde-fou scheduler)", async () => {
    // La contrainte DB chk_pm_required garantit que le scheduler Phase 2 ne peut pas activer
    // une subscription sans PM. Le scheduler doit séquencer : updateSubscriptionPaymentMethod
    // PUIS updateSubscriptionStatus('active'). Cette contrainte attrape l'inversion.
    await admin.query(
      "update billing_subscriptions set status='trialing', payment_method_id=null where artisan_id=$1",
      [A],
    );
    await repo.saveSubscription({
      artisanId: A, planId: "starter", billingMode: "maison", status: "trialing",
      currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      trialEndsAt: null, paymentMethodId: null,
    });
    await expect(repo.updateSubscriptionStatus(ctx(A), "active")).rejects.toThrow();
  });

  it("appendEvent deux fois → deux événements distincts (append-only — pas de déduplication)", async () => {
    // billing_events est un ledger immuable : deux appels identiques produisent deux lignes distinctes.
    // Important pour l'audit : chaque action génère son propre enregistrement.
    const params = {
      entityType: "artisan" as const,
      entityId: B,
      eventType: "payment_method.set_default",
      payload: { last4: "1234" },
      actor: "user:2",
    };
    const ev1 = await repo.appendEvent(params);
    const ev2 = await repo.appendEvent(params);
    expect(ev1.id).not.toBe(ev2.id);
    expect(ev2.id).toBeGreaterThan(ev1.id);
  });
});
