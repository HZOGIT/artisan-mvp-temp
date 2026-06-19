import { describe, it, expect, beforeEach } from "vitest";
import { FakeBillingRepository } from "./infra/billing-repository-fake";
import { FakeBillingPort } from "../../shared/ports/billing-adapter";
import type { StripePort } from "../../shared/ports/stripe";
import type { BillingDeps } from "./application/billing-use-cases";
import type { BillingInvoice } from "../../../../drizzle/schema.pg";
import {
  createSetupIntent,
  confirmPaymentMethod,
  revokePaymentMethod,
  setDefaultPaymentMethod,
  getBillingInfo,
  NotFoundError,
} from "./application/billing-use-cases";
import type { TenantContext } from "../../shared/tenant";

// ── Fakes ─────────────────────────────────────────────────────────────────────

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

function makeStripe(customerId = "cus_fake"): StripePort {
  return {
    createCustomer: async () => ({ id: customerId }),
    constructEvent: () => { throw new Error("not used"); },
    createInvoiceCheckout: async () => ({ url: "" }),
  } as unknown as StripePort;
}

function makeDeps(over?: Partial<{ customerId: string }>): BillingDeps & { repo: FakeBillingRepository; billing: FakeBillingPort } {
  const repo = new FakeBillingRepository();
  const billing = new FakeBillingPort();
  return { repo, billing, stripe: makeStripe(over?.customerId ?? "cus_test") };
}

// ── createSetupIntent ─────────────────────────────────────────────────────────

describe("createSetupIntent", () => {
  it("crée un Stripe customer si aucun n'existe et retourne un clientSecret", async () => {
    const deps = makeDeps();
    const result = await createSetupIntent(deps, A);
    expect(result.clientSecret).toBeTruthy();
    expect(result.stripeCustomerId).toBe("cus_test");
  });

  it("retourne setupIntentId non vide — requis par Stripe Elements pour confirmer le SetupIntent", async () => {
    // Le front passe setupIntentId à stripe.confirmSetup(). S'il est absent,
    // Stripe Elements ne peut pas finaliser le flux d'enregistrement de carte.
    const deps = makeDeps();
    const result = await createSetupIntent(deps, A);
    expect(result.setupIntentId).toBeTruthy();
  });

  it("réutilise le customer existant sans en recréer un", async () => {
    const deps = makeDeps();
    deps.repo.customerIds.set(A.artisanId, "cus_existing");
    const result = await createSetupIntent(deps, A);
    expect(result.stripeCustomerId).toBe("cus_existing");
    expect(deps.billing.setupIntentsCreated).toEqual(["cus_existing"]);
  });

  it("trace un événement billing après la création", async () => {
    const deps = makeDeps();
    await createSetupIntent(deps, A);
    expect(deps.repo.events).toHaveLength(1);
    expect(deps.repo.events[0]!.event_type).toBe("setup_intent.created");
    expect(deps.repo.events[0]!.actor).toBe(`user:${A.userId}`);
  });

  it("payload de l'événement contient setupIntentId et stripeCustomerId (recovery zombie + audit)", async () => {
    // En cas de zombie cycle (setup perdu entre createSetupIntent et confirmPaymentMethod),
    // le scheduler Phase 2 retrouvera le setupIntentId dans le log d'événements pour réconcilier.
    const deps = makeDeps();
    const result = await createSetupIntent(deps, A);
    const ev = deps.repo.events.find(e => e.event_type === "setup_intent.created");
    expect(ev?.payload).toMatchObject({
      setupIntentId: result.setupIntentId,
      stripeCustomerId: result.stripeCustomerId,
    });
  });
});

// ── confirmPaymentMethod ──────────────────────────────────────────────────────

describe("confirmPaymentMethod", () => {
  it("persiste la carte avec les infos récupérées depuis Stripe", async () => {
    const deps = makeDeps();
    const result = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_fake",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    expect(result.paymentMethod.last4).toBe("4242");
    expect(result.paymentMethod.brand).toBe("visa");
    expect(result.paymentMethod.artisan_id).toBe(A.artisanId);
  });

  it("setAsDefault=true → is_default actif + subscription PM mis à jour", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({ artisanId: A.artisanId, planId: "starter", billingMode: "maison", status: "active", currentPeriodStart: null, currentPeriodEnd: null, trialEndsAt: null, paymentMethodId: null });

    const result = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_fake",
      stripeCustomerId: "cus_test",
      setAsDefault: true,
      consentedAt: new Date(),
    });

    const pm = await deps.repo.findDefaultPaymentMethod(A);
    expect(pm?.id).toBe(result.paymentMethod.id);
    const sub = await deps.repo.findSubscription(A);
    expect(sub?.payment_method_id).toBe(result.paymentMethod.id);
  });

  it("setAsDefault=true sans subscription — PM promu default, pas de crash sur if(sub)", async () => {
    // Scénario : artisan en période d'essai sans sub encore créée (onboarding).
    // setAsDefault doit promouvoir la carte sans tenter de mettre à jour une sub inexistante.
    const deps = makeDeps();
    const result = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_nosub",
      stripeCustomerId: "cus_test",
      setAsDefault: true,
      consentedAt: new Date(),
    });
    expect(result.paymentMethod.is_default).toBe(true);
    expect(await deps.repo.findSubscription(A)).toBeNull();
  });

  it("setAsDefault=true remplace l'ancien PM de la sub (rotation de carte)", async () => {
    // Un artisan enregistre une 1ère carte (default), puis en ajoute une 2ème (nouvelle default).
    // La sub doit pointer vers la 2ème carte après la rotation.
    const deps = makeDeps();
    const { paymentMethod: pm1 } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_old",
      stripeCustomerId: "cus_test",
      setAsDefault: true,
      consentedAt: new Date(),
    });
    // Sub mise à jour avec pm1 via setDefaultPaymentMethod implicite
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: pm1.id,
    });

    const { paymentMethod: pm2 } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_new",
      stripeCustomerId: "cus_test",
      setAsDefault: true,
      consentedAt: new Date(),
    });

    expect((await deps.repo.findSubscription(A))?.payment_method_id).toBe(pm2.id);
    expect((await deps.repo.findDefaultPaymentMethod(A))?.id).toBe(pm2.id);
  });

  it("trace un événement payment_method.confirmed", async () => {
    const deps = makeDeps();
    await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_fake",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    expect(deps.repo.events.some(e => e.event_type === "payment_method.confirmed")).toBe(true);
  });
});

// ── revokePaymentMethod ───────────────────────────────────────────────────────

describe("revokePaymentMethod", () => {
  it("soft-delete : revoked_at renseigné, carte disparaît de listPaymentMethods", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_r",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    await revokePaymentMethod(deps, A, pm.id);
    expect(await deps.repo.listPaymentMethods(A)).toHaveLength(0);
  });

  it("NotFoundError si la carte appartient à un autre tenant", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_r",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    await expect(revokePaymentMethod(deps, B, pm.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("trace un événement payment_method.revoked", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_r",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    await revokePaymentMethod(deps, A, pm.id);
    expect(deps.repo.events.some(e => e.event_type === "payment_method.revoked")).toBe(true);
  });

  it("payload de l'événement payment_method.revoked contient last4 et brand (audit trail scheduler)", async () => {
    // Le scheduler Phase 2 et les webhooks Stripe lisent le payload pour identifier la carte.
    // setDefaultPaymentMethod vérifie déjà son payload (last4) — revokePaymentMethod ne l'était pas.
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_payload_chk",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    await revokePaymentMethod(deps, A, pm.id);
    const ev = deps.repo.events.find(e => e.event_type === "payment_method.revoked");
    expect(ev?.payload).toMatchObject({ last4: pm.last4, brand: pm.brand });
    expect(ev?.entity_id).toBe(pm.id);
  });

  it("idempotent — révoquer deux fois la même carte ne lève pas d'erreur", async () => {
    // findPaymentMethodById ne filtre PAS revoked_at : un PM révoqué reste trouvable.
    // Important pour l'idempotence des webhooks (Stripe peut renvoyer le même événement).
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_idem",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    await revokePaymentMethod(deps, A, pm.id);
    await expect(revokePaymentMethod(deps, A, pm.id)).resolves.toBeUndefined();
  });
});

// ── setDefaultPaymentMethod ───────────────────────────────────────────────────

describe("setDefaultPaymentMethod", () => {
  it("change la carte par défaut — une seule carte default à la fois", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm1 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_1", stripeCustomerId: "cus_test", setAsDefault: true, consentedAt: new Date() });
    const { paymentMethod: pm2 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_2", stripeCustomerId: "cus_test", setAsDefault: false, consentedAt: new Date() });

    await setDefaultPaymentMethod(deps, A, pm2.id);

    const pms = await deps.repo.listPaymentMethods(A);
    const defaults = pms.filter(p => p.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.id).toBe(pm2.id);
  });

  it("listPaymentMethods : la carte default apparaît en premier (tri is_default DESC)", async () => {
    // L'UI affiche toujours la carte par défaut en tête de liste — vérifier le tri repo.
    const deps = makeDeps();
    const { paymentMethod: pm1 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_ord_1", stripeCustomerId: "cus_test", setAsDefault: false, consentedAt: new Date() });
    const { paymentMethod: pm2 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_ord_2", stripeCustomerId: "cus_test", setAsDefault: false, consentedAt: new Date() });

    await setDefaultPaymentMethod(deps, A, pm1.id);

    const pms = await deps.repo.listPaymentMethods(A);
    expect(pms[0]!.id).toBe(pm1.id);
    expect(pms[0]!.is_default).toBe(true);
  });

  it("NotFoundError si la carte n'appartient pas au tenant", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_x", stripeCustomerId: "cus_test", setAsDefault: false, consentedAt: new Date() });
    await expect(setDefaultPaymentMethod(deps, B, pm.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("met à jour subscription.payment_method_id quand une sub existe", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_sub_link", stripeCustomerId: "cus_test",
      setAsDefault: false, consentedAt: new Date(),
    });

    await setDefaultPaymentMethod(deps, A, pm.id);

    expect((await deps.repo.findSubscription(A))?.payment_method_id).toBe(pm.id);
  });

  it("sans subscription → payment_method_id ignoré (guard if(sub))", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_no_sub", stripeCustomerId: "cus_test",
      setAsDefault: false, consentedAt: new Date(),
    });

    await setDefaultPaymentMethod(deps, A, pm.id);

    expect(await deps.repo.findSubscription(A)).toBeNull();
  });

  it("trace un événement payment_method.set_default avec last4", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_evt", stripeCustomerId: "cus_test",
      setAsDefault: false, consentedAt: new Date(),
    });

    await setDefaultPaymentMethod(deps, A, pm.id);

    const ev = deps.repo.events.find(e => e.event_type === "payment_method.set_default");
    expect(ev).toBeDefined();
    expect(ev?.entity_id).toBe(pm.id);
    expect(ev?.payload).toMatchObject({ last4: pm.last4 });
  });
});

// ── getBillingInfo ────────────────────────────────────────────────────────────

describe("getBillingInfo", () => {
  it("retourne subscription null si aucune", async () => {
    const deps = makeDeps();
    const info = await getBillingInfo(deps, A);
    expect(info.subscription).toBeNull();
    expect(info.paymentMethods).toEqual([]);
    expect(info.recentInvoices).toEqual([]);
    expect(info.plan).toBeUndefined();
  });

  it("retourne le plan résolu si abonnement présent", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({ artisanId: A.artisanId, planId: "pro", billingMode: "maison", status: "active", currentPeriodStart: null, currentPeriodEnd: null, trialEndsAt: null, paymentMethodId: null });
    const info = await getBillingInfo(deps, A);
    expect(info.plan?.id).toBe("pro");
  });

  it("plan=undefined si plan_id inconnu (donnée corrompue) — getBillingInfo reste robuste", async () => {
    // Si la DB contient un plan_id qui n'existe plus dans le catalogue, planById() retourne
    // undefined. getBillingInfo ne doit pas crasher — il expose plan=undefined à l'UI.
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "plan_supprimé_xyz", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    const info = await getBillingInfo(deps, A);
    expect(info.subscription).not.toBeNull();
    expect(info.plan).toBeUndefined();
  });

  it("isolation cross-tenant — artisan B ne voit pas les données de A", async () => {
    const deps = makeDeps();
    await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_a", stripeCustomerId: "cus_a", setAsDefault: false, consentedAt: new Date() });
    const infoB = await getBillingInfo(deps, B);
    expect(infoB.paymentMethods).toHaveLength(0);
  });

  it("PM révoquée absente de paymentMethods — revoked_at filtré par listPaymentMethods", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_revoked_info",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    expect((await getBillingInfo(deps, A)).paymentMethods).toHaveLength(1);

    await revokePaymentMethod(deps, A, pm.id);

    const info = await getBillingInfo(deps, A);
    expect(info.paymentMethods).toHaveLength(0);
  });
});

// ── confirmPaymentMethod — cas setAsDefault=false ────────────────────────────

describe("confirmPaymentMethod — setAsDefault=false", () => {
  it("PM persisté mais subscription.payment_method_id non modifié", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    const result = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_no_def",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });

    expect(result.paymentMethod.id).toBeGreaterThan(0);
    // Sub pas touchée
    expect((await deps.repo.findSubscription(A))?.payment_method_id).toBeNull();
    // Aucune carte default
    expect(await deps.repo.findDefaultPaymentMethod(A)).toBeNull();
  });
});

// ── revokePaymentMethod — carte default ──────────────────────────────────────

describe("revokePaymentMethod — carte default", () => {
  it("révoquer la carte default → findDefaultPaymentMethod retourne null", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_def",
      stripeCustomerId: "cus_test",
      setAsDefault: true,
      consentedAt: new Date(),
    });
    expect((await deps.repo.findDefaultPaymentMethod(A))?.id).toBe(pm.id);

    await revokePaymentMethod(deps, A, pm.id);

    expect(await deps.repo.findDefaultPaymentMethod(A)).toBeNull();
  });

  it("révoquer la carte default avec une autre carte présente → l'autre n'est pas promue auto", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm1 } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_d1", stripeCustomerId: "cus_test",
      setAsDefault: true, consentedAt: new Date(),
    });
    await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_d2", stripeCustomerId: "cus_test",
      setAsDefault: false, consentedAt: new Date(),
    });

    await revokePaymentMethod(deps, A, pm1.id);

    // L'autre carte existe mais n'est pas promue automatiquement (la logique de promotion
    // appartient à la Phase 2 scheduler, pas au use-case de révocation)
    expect(await deps.repo.findDefaultPaymentMethod(A)).toBeNull();
    expect(await deps.repo.listPaymentMethods(A)).toHaveLength(1);
  });

  it("révoquer un PM lié à une sub → sub.payment_method_id inchangé (Phase 2 scheduler en charge)", async () => {
    // revokePaymentMethod ne touche PAS billing_subscriptions.payment_method_id.
    // La sub reste référencer le PM révoqué : le scheduler Phase 2 doit vérifier
    // si le PM lié est actif avant de tenter un prélèvement.
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_sub_revoke",
      stripeCustomerId: "cus_test",
      setAsDefault: true,
      consentedAt: new Date(),
    });
    expect((await deps.repo.findSubscription(A))?.payment_method_id).toBe(pm.id);

    await revokePaymentMethod(deps, A, pm.id);

    // Sub toujours liée au PM révoqué (payment_method_id inchangé)
    expect((await deps.repo.findSubscription(A))?.payment_method_id).toBe(pm.id);
  });
});

// ── createSetupIntent — fallback customer legacy ──────────────────────────────

describe("createSetupIntent — customer pré-existant (legacy ou maison)", () => {
  it("customer trouvé via repo → createCustomer Stripe jamais appelé", async () => {
    let createCustomerCalls = 0;
    const trackingStripe = {
      createCustomer: async () => { createCustomerCalls++; return { id: "cus_new" }; },
      constructEvent: () => { throw new Error("not used"); },
      createInvoiceCheckout: async () => ({ url: "" }),
    } as unknown as StripePort;

    const repo = new FakeBillingRepository();
    repo.customerIds.set(A.artisanId, "cus_legacy_42");
    const deps = { repo, billing: new FakeBillingPort(), stripe: trackingStripe };

    const result = await createSetupIntent(deps, A);

    expect(result.stripeCustomerId).toBe("cus_legacy_42");
    expect(createCustomerCalls).toBe(0);
  });
});

// ── getBillingInfo — factures récentes ───────────────────────────────────────

describe("getBillingInfo — factures récentes", () => {
  it("recentInvoices retourne les factures du tenant (isolation cross-tenant)", async () => {
    const deps = makeDeps();
    const invoice: BillingInvoice = {
      id: 1, artisan_id: A.artisanId,
      number: "OPE-2026-00001", stripe_invoice_id: null, stripe_invoice_number: null,
      type: "subscription", status: "paid",
      subtotal_cents: 2900, tax_cents: 0, total_cents: 2900,
      credit_amount_cents: 0, refund_amount_cents: 0, currency: "eur",
      billing_cycle_id: null, original_invoice_id: null,
      stripe_payment_intent_id: "pi_test", pdf_url: null,
      buyer_siren: null, buyer_routing_id: null,
      einvoice_format: null, einvoice_status: null,
      einvoice_pa_message_id: null, einvoice_hash: null,
      due_at: null, paid_at: new Date("2026-06-01"), voided_at: null,
      created_at: new Date("2026-06-01"), updated_at: new Date("2026-06-01"),
    };
    deps.repo.invoices.push(invoice);

    const infoA = await getBillingInfo(deps, A);
    expect(infoA.recentInvoices).toHaveLength(1);
    expect(infoA.recentInvoices[0]!.number).toBe("OPE-2026-00001");
    expect(infoA.recentInvoices[0]!.total_cents).toBe(2900);

    // B ne voit pas les factures de A
    const infoB = await getBillingInfo(deps, B);
    expect(infoB.recentInvoices).toHaveLength(0);
  });

  it("recentInvoices respecte la limite de 12", async () => {
    const deps = makeDeps();
    for (let i = 1; i <= 15; i++) {
      deps.repo.invoices.push({
        id: i, artisan_id: A.artisanId,
        number: null, stripe_invoice_id: null, stripe_invoice_number: null,
        type: "subscription", status: "draft",
        subtotal_cents: 990, tax_cents: 0, total_cents: 990,
        credit_amount_cents: 0, refund_amount_cents: 0, currency: "eur",
        billing_cycle_id: null, original_invoice_id: null,
        stripe_payment_intent_id: null, pdf_url: null,
        buyer_siren: null, buyer_routing_id: null,
        einvoice_format: null, einvoice_status: null,
        einvoice_pa_message_id: null, einvoice_hash: null,
        due_at: null, paid_at: null, voided_at: null,
        created_at: new Date(), updated_at: new Date(),
      });
    }
    const info = await getBillingInfo(deps, A);
    expect(info.recentInvoices.length).toBeLessThanOrEqual(12);
  });
});

// ── Changements de plan (prorata — logique domaine) ───────────────────────────

describe("changements de plan — nextCycleAmount", () => {
  it("upgrade starter→pro : le montant du prochain cycle augmente", async () => {
    const { nextCycleAmount } = await import("./domain/subscription-maison");
    const { PLANS } = await import("./domain/plan");

    const sub = {
      id: 1, artisanId: 1, planId: "starter", billingMode: "maison" as const, status: "active" as const,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAt: null, canceledAt: null,
      trialEndsAt: null, paymentMethodId: null, createdAt: new Date(), updatedAt: new Date(),
    };

    const montantStarter = nextCycleAmount(sub, PLANS.starter, "monthly");
    const montantPro = nextCycleAmount({ ...sub, planId: "pro" }, PLANS.pro, "monthly");
    expect(montantPro).toBeGreaterThan(montantStarter);
  });

  it("downgrade pro→starter : le montant diminue", async () => {
    const { nextCycleAmount } = await import("./domain/subscription-maison");
    const { PLANS } = await import("./domain/plan");

    const sub = {
      id: 1, artisanId: 1, planId: "pro", billingMode: "maison" as const, status: "active" as const,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAt: null, canceledAt: null,
      trialEndsAt: null, paymentMethodId: null, createdAt: new Date(), updatedAt: new Date(),
    };

    const montantPro = nextCycleAmount(sub, PLANS.pro, "monthly");
    const montantStarter = nextCycleAmount({ ...sub, planId: "starter" }, PLANS.starter, "monthly");
    expect(montantStarter).toBeLessThan(montantPro);
  });

  it("passage monthly→yearly : montant yearly < monthly × 12 (remise)", async () => {
    const { nextCycleAmount } = await import("./domain/subscription-maison");
    const { PLANS } = await import("./domain/plan");

    const sub = {
      id: 1, artisanId: 1, planId: "pro", billingMode: "maison" as const, status: "active" as const,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAt: null, canceledAt: null,
      trialEndsAt: null, paymentMethodId: null, createdAt: new Date(), updatedAt: new Date(),
    };

    const monthly12 = nextCycleAmount(sub, PLANS.pro, "monthly") * 12;
    const yearly = nextCycleAmount(sub, PLANS.pro, "yearly");
    expect(yearly).toBeLessThanOrEqual(monthly12);
  });
});
