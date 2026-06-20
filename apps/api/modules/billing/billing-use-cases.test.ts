import { describe, it, expect, beforeEach } from "vitest";
import { FakeBillingRepository } from "./infra/billing-repository-fake";
import { FakeBillingPort } from "../../shared/ports/billing-adapter";
import { handleBillingWebhookEvent } from "./interface/http/billing-webhook-handler";
import type { StripePort } from "../../shared/ports/stripe";
import type { BillingDeps } from "./application/billing-use-cases";
import type { BillingInvoice } from "../../../../drizzle/schema.pg";
import {
  createSetupIntent,
  confirmPaymentMethod,
  revokePaymentMethod,
  setDefaultPaymentMethod,
  getBillingInfo,
  changePlan,
  cancelAtPeriodEnd,
  reactivateSubscription,
  NotFoundError,
  InvalidPlanError,
} from "./application/billing-use-cases";
import type { TenantContext } from "../../shared/tenant";


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

  it("payload de l'événement payment_method.confirmed contient brand, last4, isDefault et entity_id", async () => {
    // FakeBillingPort.retrievePaymentMethod retourne brand='visa', last4='4242'.
    // Le payload alimente les alertes webhook et le scheduler Phase 2 (réconciliation).
    // isDefault=true = la carte est devenue la carte principale après confirmation.
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_payload_confirm",
      stripeCustomerId: "cus_test",
      setAsDefault: true,
      consentedAt: new Date(),
    });
    const ev = deps.repo.events.find(e => e.event_type === "payment_method.confirmed");
    expect(ev?.entity_id).toBe(pm.id);
    expect(ev?.payload).toMatchObject({ brand: pm.brand, last4: pm.last4, isDefault: true });
  });

  it("setAsDefault=false avec sub existante → sub.payment_method_id reste inchangé", async () => {
    // Un artisan ajoute une 2ème carte sans la définir comme défaut.
    // La sub doit continuer à pointer vers la carte originale (null ici).
    // Invariant : confirmPaymentMethod avec setAsDefault=false ne déclenche ni
    // setDefaultPaymentMethod ni updateSubscriptionPaymentMethod.
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_secondary",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    expect((await deps.repo.findSubscription(A))?.payment_method_id).toBeNull();
  });
});


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

  it("révoquer la PM liée à la sub → sub.payment_method_id reste inchangé (référence pendante — dunning scheduler)", async () => {
    // Le use-case revokePaymentMethod ne touche PAS subscription.payment_method_id.
    // C'est intentionnel : la sub garde une référence pendante vers la PM révoquée.
    // Le scheduler Phase 2 détecte cette situation (pm.revoked_at IS NOT NULL) et
    // déclenche le dunning (bloquer, notifier, relancer avec une nouvelle carte).
    // Ce test documente l'invariant : revokePaymentMethod n'est PAS responsable
    // de nettoyer la sub — uniquement le scheduler l'est.
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_linked_sub",
      stripeCustomerId: "cus_test",
      setAsDefault: true,
      consentedAt: new Date(),
    });
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: pm.id,
    });

    await revokePaymentMethod(deps, A, pm.id);

    const sub = await deps.repo.findSubscription(A);
    expect(sub?.payment_method_id).toBe(pm.id);
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


describe("setDefaultPaymentMethod", () => {
  it("FIX-CQ — jamais de fenêtre sans carte default (atomicité) : exactement 1 default après chaque changement", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm1 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_cq1", stripeCustomerId: "cus_test", setAsDefault: true, consentedAt: new Date() });
    const { paymentMethod: pm2 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_cq2", stripeCustomerId: "cus_test", setAsDefault: false, consentedAt: new Date() });
    const { paymentMethod: pm3 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_cq3", stripeCustomerId: "cus_test", setAsDefault: false, consentedAt: new Date() });

    for (const targetId of [pm2.id, pm3.id, pm1.id]) {
      await setDefaultPaymentMethod(deps, A, targetId);
      const pms = await deps.repo.listPaymentMethods(A);
      const defaults = pms.filter(p => p.is_default);
      expect(defaults).toHaveLength(1);
      expect(defaults[0]!.id).toBe(targetId);
    }
  });

  it("FIX-CR — setDefault sur PM révoqué → NotFoundError (n'efface pas le default actuel)", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm1 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_cr1", stripeCustomerId: "cus_test", setAsDefault: true, consentedAt: new Date() });
    const { paymentMethod: pm2 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_cr2", stripeCustomerId: "cus_test", setAsDefault: false, consentedAt: new Date() });
    await revokePaymentMethod(deps, A, pm2.id);

    await expect(setDefaultPaymentMethod(deps, A, pm2.id)).rejects.toThrow(NotFoundError);

    const pms = await deps.repo.listPaymentMethods(A);
    const defaults = pms.filter(p => p.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.id).toBe(pm1.id);
  });

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


describe("changePlan", () => {
  it("upgrade starter→pro : subscription.plan_id mis à jour + event subscription.plan_changed émis", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await changePlan(deps, A, "pro");

    const sub = await deps.repo.findSubscription(A);
    expect(sub?.plan_id).toBe("pro");

    const ev = deps.repo.events.find(e => e.event_type === "subscription.plan_changed");
    expect(ev).toBeDefined();
    expect(ev!.payload).toMatchObject({ from: "starter", to: "pro" });
  });

  it("downgrade pro→starter : plan_id mis à jour", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await changePlan(deps, A, "starter");

    const sub = await deps.repo.findSubscription(A);
    expect(sub?.plan_id).toBe("starter");
  });

  it("même plan → no-op (aucun event émis)", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await changePlan(deps, A, "pro");

    const changed = deps.repo.events.filter(e => e.event_type === "subscription.plan_changed");
    expect(changed).toHaveLength(0);
  });

  it("plan inconnu → InvalidPlanError", async () => {
    const deps = makeDeps();
    await expect(changePlan(deps, A, "unknown_plan")).rejects.toBeInstanceOf(InvalidPlanError);
  });

  it("aucune subscription → NotFoundError", async () => {
    const deps = makeDeps();
    await expect(changePlan(deps, A, "pro")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("FIX-H : upgrade starter→pro met à jour amount_cents du cycle pending au tarif pro", async () => {
    const deps = makeDeps();
    const sub = await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: new Date("2026-06-01"), currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null, paymentMethodId: null,
    });
    await deps.repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-08-01"),
      amountCents: 2900,
      currency: "eur",
    });

    await changePlan(deps, A, "pro");

    const updatedCycle = deps.repo.cycles[0]!;
    expect(updatedCycle.amount_cents).toBe(4900);
  });

  it("FIX-H : changePlan sans cycle pending n'échoue pas", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await expect(changePlan(deps, A, "pro")).resolves.toBeUndefined();
  });

  it("FIX-P — sub canceled → changePlan no-op, plan_id non modifié", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "canceled", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await changePlan(deps, A, "pro");

    const sub = await deps.repo.findSubscription(A);
    expect(sub?.plan_id).toBe("starter");
    const evts = deps.repo.events.filter(e => e.event_type === "subscription.plan_changed");
    expect(evts).toHaveLength(0);
  });
});


describe("cancelAtPeriodEnd", () => {
  it("sub active avec current_period_end → cancel_at = current_period_end", async () => {
    const deps = makeDeps();
    const periodEnd = new Date("2026-07-19T00:00:00Z");
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: periodEnd,
      trialEndsAt: null, paymentMethodId: null,
    });

    await cancelAtPeriodEnd(deps, A);

    const sub = await deps.repo.findSubscription(A);
    expect(sub?.cancel_at?.toISOString()).toBe(periodEnd.toISOString());
    const ev = deps.repo.events.find(e => e.event_type === "subscription.cancel_scheduled");
    expect(ev).toBeDefined();
  });

  it("FIX-CD — sub trialing avec trial_ends_at → cancel_at = trial_ends_at (pas now())", async () => {
    const deps = makeDeps();
    const trialEnd = new Date("2026-07-03T00:00:00Z");
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: trialEnd, paymentMethodId: null,
    });

    await cancelAtPeriodEnd(deps, A);

    const sub = await deps.repo.findSubscription(A);
    expect(sub?.cancel_at?.toISOString()).toBe(trialEnd.toISOString());
    const ev = deps.repo.events.find(e => e.event_type === "subscription.cancel_scheduled");
    expect(ev).toBeDefined();
    expect((ev!.payload as Record<string, unknown>)["cancelAt"]).toBe(trialEnd.toISOString());
  });

  it("sub sans current_period_end → cancel_at ≈ now()", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    const before = Date.now();
    await cancelAtPeriodEnd(deps, A);
    const after = Date.now();

    const sub = await deps.repo.findSubscription(A);
    const cancelTs = sub?.cancel_at?.getTime() ?? 0;
    expect(cancelTs).toBeGreaterThanOrEqual(before - 1000);
    expect(cancelTs).toBeLessThanOrEqual(after + 1000);
  });

  it("cancel_at déjà positionné → no-op (aucun event émis)", async () => {
    const deps = makeDeps();
    const alreadySet = new Date("2026-07-01T00:00:00Z");
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: alreadySet,
      trialEndsAt: null, paymentMethodId: null,
    });
    await deps.repo.updateCancelAt(A, alreadySet);

    await cancelAtPeriodEnd(deps, A);

    const events = deps.repo.events.filter(e => e.event_type === "subscription.cancel_scheduled");
    expect(events).toHaveLength(0);
  });

  it("aucune subscription → NotFoundError", async () => {
    const deps = makeDeps();
    await expect(cancelAtPeriodEnd(deps, A)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("reactivateSubscription", () => {
  it("sub avec cancel_at → cancel_at = null + event reactivated", async () => {
    const deps = makeDeps();
    const cancelAt = new Date("2026-07-19T00:00:00Z");
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: cancelAt,
      trialEndsAt: null, paymentMethodId: null,
    });
    await deps.repo.updateCancelAt(A, cancelAt);

    await reactivateSubscription(deps, A);

    const sub = await deps.repo.findSubscription(A);
    expect(sub?.cancel_at).toBeNull();
    const ev = deps.repo.events.find(e => e.event_type === "subscription.reactivated");
    expect(ev).toBeDefined();
  });

  it("cancel_at déjà null → no-op (aucun event émis)", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await reactivateSubscription(deps, A);

    const events = deps.repo.events.filter(e => e.event_type === "subscription.reactivated");
    expect(events).toHaveLength(0);
  });

  it("aucune subscription → NotFoundError", async () => {
    const deps = makeDeps();
    await expect(reactivateSubscription(deps, A)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("FIX-L — sub canceled avec cancel_at (scheduler exécuté) → no-op, cancel_at conservé", async () => {
    /* Bug : le scheduler passe status→canceled mais ne clear pas cancel_at.
       reactivateSubscription ne doit pas effacer cancel_at sans remettre status→active. */
    const deps = makeDeps();
    const pastCancelAt = new Date("2026-05-01T00:00:00Z");
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: pastCancelAt,
      trialEndsAt: null, paymentMethodId: null,
    });
    await deps.repo.updateCancelAt(A, pastCancelAt);
    await deps.repo.updateSubscriptionStatus(A, "canceled");

    await reactivateSubscription(deps, A);

    const sub = await deps.repo.findSubscription(A);
    expect(sub?.status).toBe("canceled");
    expect(sub?.cancel_at).not.toBeNull();
    const events = deps.repo.events.filter(e => e.event_type === "subscription.reactivated");
    expect(events).toHaveLength(0);
  });
});

describe("cancelAtPeriodEnd — FIX-L — status guard", () => {
  it("sub canceled → no-op (aucun event, cancel_at inchangé)", async () => {
    /* Bug symétrique : cancelAtPeriodEnd ne doit pas planifier une annulation sur une sub déjà annulée. */
    const deps = makeDeps();
    const periodEnd = new Date("2026-05-01T00:00:00Z");
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "canceled", currentPeriodStart: null, currentPeriodEnd: periodEnd,
      trialEndsAt: null, paymentMethodId: null,
    });

    await cancelAtPeriodEnd(deps, A);

    const sub = await deps.repo.findSubscription(A);
    expect(sub?.cancel_at).toBeNull();
    const events = deps.repo.events.filter(e => e.event_type === "subscription.cancel_scheduled");
    expect(events).toHaveLength(0);
  });
});

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

describe("FIX-J — reprise facturation après dunning épuisé (resumeBillingIfAbandoned)", () => {
  async function setupPastDueWithAbandoned(repo: FakeBillingRepository) {
    const sub = await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "past_due", currentPeriodStart: new Date("2026-06-01"), currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null, paymentMethodId: null,
    });
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    repo.cycles[0] = { ...cycle, status: "failed", next_retry_at: null, attempt_count: 4, failed_at: new Date() };
    return { sub, cycle: repo.cycles[0]! };
  }

  it("confirmPaymentMethod(setAsDefault=true) sur past_due remet le cycle en pending + sub active", async () => {
    const deps = makeDeps();
    await setupPastDueWithAbandoned(deps.repo);

    await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_new",
      stripeCustomerId: "cus_x",
      setAsDefault: true,
      consentedAt: new Date(),
    });

    expect(deps.repo.cycles[0]!.status).toBe("pending");
    expect(deps.repo.cycles[0]!.next_retry_at).toBeNull();
    /* FIX-Q : attempt_count NON remis à 0 — évite collision UNIQUE sur (cycle_id, attempt_no) */
    expect(deps.repo.cycles[0]!.attempt_count).toBe(4);
    expect(deps.repo.subs[0]!.status).toBe("active");

    const ev = deps.repo.events.find(e => e.event_type === "subscription.billing_resumed");
    expect(ev).toBeDefined();
    expect(ev!.payload).toMatchObject({ reason: "payment_method_updated" });
  });

  it("setDefaultPaymentMethod sur past_due remet le cycle en pending + sub active", async () => {
    const deps = makeDeps();
    await setupPastDueWithAbandoned(deps.repo);

    const pm = await deps.repo.savePaymentMethod({
      artisanId: A.artisanId, stripeCustomerId: "cus_x", stripePaymentMethodId: "pm_saved",
      brand: "visa", last4: "4242", expMonth: 12, expYear: 2028, consentedAt: new Date(),
    });

    await setDefaultPaymentMethod(deps, A, pm.id);

    expect(deps.repo.cycles[0]!.status).toBe("pending");
    expect(deps.repo.subs[0]!.status).toBe("active");
  });

  it("confirmPaymentMethod sur sub active → pas de resumeBilling (pas de changement de statut)", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_ok",
      stripeCustomerId: "cus_x",
      setAsDefault: true,
      consentedAt: new Date(),
    });

    /* Aucun event de reprise — la sub était déjà active */
    expect(deps.repo.events.find(e => e.event_type === "subscription.billing_resumed")).toBeUndefined();
  });

  it("confirmPaymentMethod(setAsDefault=false) sur past_due → pas de reprise (PM non promu)", async () => {
    const deps = makeDeps();
    await setupPastDueWithAbandoned(deps.repo);

    await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_notdefault",
      stripeCustomerId: "cus_x",
      setAsDefault: false,
      consentedAt: new Date(),
    });

    /* Le cycle reste abandonné — setAsDefault=false n'a pas déclenché resumeBilling */
    expect(deps.repo.cycles[0]!.status).toBe("failed");
    expect(deps.repo.subs[0]!.status).toBe("past_due");
  });
});

describe("FIX-V — normalizeStatus : mapping statuts Stripe legacy → state machine maison", () => {
  it("statuts valides passent tels quels", async () => {
    const { normalizeStatus } = await import("./application/billing-migration");
    expect(normalizeStatus("trialing")).toBe("trialing");
    expect(normalizeStatus("active")).toBe("active");
    expect(normalizeStatus("past_due")).toBe("past_due");
    expect(normalizeStatus("canceled")).toBe("canceled");
  });

  it("unpaid → past_due (factures ouvertes non payées)", async () => {
    const { normalizeStatus } = await import("./application/billing-migration");
    expect(normalizeStatus("unpaid")).toBe("past_due");
  });

  it("incomplete_expired → canceled (premier paiement jamais effectué sous 23h)", async () => {
    const { normalizeStatus } = await import("./application/billing-migration");
    expect(normalizeStatus("incomplete_expired")).toBe("canceled");
  });

  it("incomplete / null / inconnu → active (paiement initial en cours ou statut inconnu)", async () => {
    const { normalizeStatus } = await import("./application/billing-migration");
    expect(normalizeStatus("incomplete")).toBe("active");
    expect(normalizeStatus(null)).toBe("active");
    expect(normalizeStatus("paused")).toBe("active");
    expect(normalizeStatus(undefined)).toBe("active");
  });
});

describe("FIX-X — artisanId uniforme dans tous les payloads billing_events", () => {
  it("payment_method.confirmed payload contient artisanId", async () => {
    const deps = makeDeps();
    await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_fixX_1", stripeCustomerId: "cus_x",
      setAsDefault: false, consentedAt: new Date(),
    });
    const ev = deps.repo.events.find(e => e.event_type === "payment_method.confirmed");
    expect(ev?.payload).toMatchObject({ artisanId: A.artisanId });
  });

  it("payment_method.revoked payload contient artisanId", async () => {
    const deps = makeDeps();
    const pm = await deps.repo.savePaymentMethod({
      artisanId: A.artisanId, stripeCustomerId: "cus_x", stripePaymentMethodId: "pm_fixX_2",
      brand: "visa", last4: "1234", expMonth: 12, expYear: 2027, consentedAt: new Date(),
    });
    await revokePaymentMethod(deps, A, pm.id);
    const ev = deps.repo.events.find(e => e.event_type === "payment_method.revoked");
    expect(ev?.payload).toMatchObject({ artisanId: A.artisanId });
  });

  it("payment_method.set_default payload contient artisanId", async () => {
    const deps = makeDeps();
    const pm = await deps.repo.savePaymentMethod({
      artisanId: A.artisanId, stripeCustomerId: "cus_x", stripePaymentMethodId: "pm_fixX_3",
      brand: "mc", last4: "5678", expMonth: 6, expYear: 2028, consentedAt: new Date(),
    });
    await setDefaultPaymentMethod(deps, A, pm.id);
    const ev = deps.repo.events.find(e => e.event_type === "payment_method.set_default");
    expect(ev?.payload).toMatchObject({ artisanId: A.artisanId });
  });

  it("subscription.billing_resumed payload contient artisanId", async () => {
    const deps = makeDeps();
    const sub = await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "past_due", currentPeriodStart: new Date("2026-06-01"), currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null, paymentMethodId: null,
    });
    const cycle = await deps.repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    deps.repo.cycles[0] = { ...cycle, status: "failed", next_retry_at: null, attempt_count: 4, failed_at: new Date() };
    const pm = await deps.repo.savePaymentMethod({
      artisanId: A.artisanId, stripeCustomerId: "cus_x", stripePaymentMethodId: "pm_fixX_4",
      brand: "visa", last4: "9999", expMonth: 12, expYear: 2029, consentedAt: new Date(),
    });
    await setDefaultPaymentMethod(deps, A, pm.id);
    const ev = deps.repo.events.find(e => e.event_type === "subscription.billing_resumed");
    expect(ev?.payload).toMatchObject({ artisanId: A.artisanId });
  });

  it("subscription.reactivated payload contient artisanId", async () => {
    const deps = makeDeps();
    const cancelAt = new Date(Date.now() + 86400_000);
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: new Date(Date.now() + 86400_000),
      trialEndsAt: null, paymentMethodId: null,
    });
    await deps.repo.updateCancelAt(A, cancelAt);
    await reactivateSubscription(deps, A);
    const ev = deps.repo.events.find(e => e.event_type === "subscription.reactivated");
    expect(ev?.payload).toMatchObject({ artisanId: A.artisanId });
  });

  it("subscription.cancel_scheduled payload contient artisanId", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: new Date(Date.now() + 86400_000),
      trialEndsAt: null, paymentMethodId: null,
    });
    await cancelAtPeriodEnd(deps, A);
    const ev = deps.repo.events.find(e => e.event_type === "subscription.cancel_scheduled");
    expect(ev?.payload).toMatchObject({ artisanId: A.artisanId });
  });

  it("subscription.plan_changed payload contient artisanId", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    await changePlan(deps, A, "pro");
    const ev = deps.repo.events.find(e => e.event_type === "subscription.plan_changed");
    expect(ev?.payload).toMatchObject({ artisanId: A.artisanId });
  });
});

describe("FIX-Y — FakeBillingRepository fidélité au Drizzle", () => {
  it("saveSubscription upsert : tous les champs mis à jour (plan_id, billing_interval, billing_mode, period, trial)", async () => {
    const repo = new FakeBillingRepository();
    const periodStart = new Date("2026-06-01");
    const periodEnd = new Date("2026-07-01");
    const trialEnd = new Date("2026-06-15");

    await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingInterval: "monthly",
      billingMode: "maison", status: "trialing",
      currentPeriodStart: null, currentPeriodEnd: null, trialEndsAt: trialEnd, paymentMethodId: null,
    });

    const pmId = 42;
    await repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingInterval: "yearly",
      billingMode: "stripe", status: "active",
      currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, trialEndsAt: null, paymentMethodId: pmId,
    });

    const sub = await repo.findSubscription(A);
    expect(sub?.plan_id).toBe("pro");
    expect(sub?.billing_interval).toBe("yearly");
    expect(sub?.billing_mode).toBe("stripe");
    expect(sub?.status).toBe("active");
    expect(sub?.current_period_start?.toISOString()).toBe(periodStart.toISOString());
    expect(sub?.current_period_end?.toISOString()).toBe(periodEnd.toISOString());
    expect(sub?.trial_ends_at).toBeNull();
    expect(sub?.payment_method_id).toBe(pmId);
  });

  it("saveSubscription upsert : id et cancel_at préservés (non écrasés)", async () => {
    const repo = new FakeBillingRepository();
    const cancelAt = new Date("2026-07-31");

    const first = await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    await repo.updateCancelAt(A, cancelAt);

    await repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    const sub = await repo.findSubscription(A);
    expect(sub?.id).toBe(first.id);
    expect(sub?.cancel_at?.toISOString()).toBe(cancelAt.toISOString());
  });

  it("createChargeAttempt UNIQUE(cycle_id, attempt_no) : doublon → erreur comme Drizzle", async () => {
    const repo = new FakeBillingRepository();
    await repo.createChargeAttempt({ cycleId: 1, attemptNo: 1, idempotencyKey: "k1" });
    await expect(repo.createChargeAttempt({ cycleId: 1, attemptNo: 1, idempotencyKey: "k2" }))
      .rejects.toThrow("unique constraint");
  });

  it("createChargeAttempt : même cycle_id, attempt_no différent → autorisé", async () => {
    const repo = new FakeBillingRepository();
    await repo.createChargeAttempt({ cycleId: 1, attemptNo: 1, idempotencyKey: "k1" });
    await expect(repo.createChargeAttempt({ cycleId: 1, attemptNo: 2, idempotencyKey: "k2" }))
      .resolves.toBeDefined();
  });
});

describe("FIX-BB — cycle.charge_failed webhook : artisanId + attemptNo dans le payload", () => {
  async function setupWebhookFailure(repo: FakeBillingRepository, attemptNo = 1) {
    const sub = await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: new Date("2026-06-01"), currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null, paymentMethodId: null,
    });
    const cycle = await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    await repo.updateCycleStatus(cycle.id, { status: "charging", chargingStartedAt: new Date(), attemptCount: attemptNo });
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo, idempotencyKey: `k${attemptNo}` });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_fail", status: "processing" });
    return { sub, cycle, attempt };
  }

  it("tentative non-finale → cycle.charge_failed contient artisanId + attemptNo", async () => {
    const repo = new FakeBillingRepository();
    const { sub, attempt } = await setupWebhookFailure(repo, 1);

    await handleBillingWebhookEvent(
      { repo },
      "payment_intent.payment_failed",
      "pi_fail",
      "card_declined",
      "Your card was declined.",
      "evt_bb1",
    );

    const ev = repo.events.find(e => e.event_type === "cycle.charge_failed");
    expect(ev).toBeDefined();
    expect(ev!.payload).toMatchObject({
      via: "webhook",
      artisanId: sub.artisan_id,
      attemptNo: attempt.attempt_no,
      failureCode: "card_declined",
    });
  });

  it("tentative finale → suspension + artisanId présent dans cycle.charge_failed", async () => {
    const repo = new FakeBillingRepository();
    const { sub } = await setupWebhookFailure(repo, 4);

    await handleBillingWebhookEvent(
      { repo },
      "payment_intent.payment_failed",
      "pi_fail",
      "insufficient_funds",
      null,
      "evt_bb2",
    );

    const failEv = repo.events.find(e => e.event_type === "cycle.charge_failed");
    expect(failEv!.payload).toMatchObject({ artisanId: sub.artisan_id, attemptNo: 4 });
    const suspEv = repo.events.find(e => e.event_type === "subscription.suspended");
    expect(suspEv).toBeDefined();
    expect((suspEv!.payload as Record<string, unknown>)["artisanId"]).toBe(sub.artisan_id);
  });
});

describe("FIX-CE — webhook payment_intent.succeeded : sub canceled → ne pas ressusciter", () => {
  it("PI succeeded reçu après annulation de la sub → cycle paid, aucun period_advanced, sub reste canceled", async () => {
    const repo = new FakeBillingRepository();
    const periodEnd = new Date("2026-07-01T00:00:00Z");
    const sub = await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "canceled", currentPeriodStart: new Date("2026-06-01"), currentPeriodEnd: periodEnd,
      trialEndsAt: null, paymentMethodId: null,
    });
    const cycle = await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-06-01"), periodEnd,
      amountCents: 2900, currency: "eur",
    });
    await repo.updateCycleStatus(cycle.id, { status: "charging", chargingStartedAt: new Date() });
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k_ce" });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_ce", status: "processing" });

    await handleBillingWebhookEvent({ repo }, "payment_intent.succeeded", "pi_ce", null, null, "evt_ce1");

    expect(repo.cycles.find(c => c.id === cycle.id)!.status).toBe("paid");
    expect(repo.subs.find(s => s.id === sub.id)!.status).toBe("canceled");
    expect(repo.cycles.filter(c => c.subscription_id === sub.id)).toHaveLength(1);
    expect(repo.events.find(e => e.event_type === "subscription.period_advanced")).toBeUndefined();
    expect(repo.events.find(e => e.event_type === "cycle.paid")).toBeDefined();
  });
});
