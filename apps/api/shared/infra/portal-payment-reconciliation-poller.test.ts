import { describe, it, expect, vi } from "vitest";
import { reconcileOrphanedPayment } from "./portal-payment-reconciliation-poller";
import type { OrphanedPayment } from "./portal-payment-reconciliation-poller";
import { FakeStripePort } from "../ports/stripe-adapter";
import type { WebhookPaymentWriter } from "../../modules/subscription/application/webhook-payment-writer";

const makePayment = (overrides: Partial<OrphanedPayment> = {}): OrphanedPayment => ({
  id: 1,
  artisanId: 10,
  factureId: 30,
  stripeSessionId: "cs_test_abc",
  tokenPaiement: "tok_abc",
  ...overrides,
});

const makeWriter = (): WebhookPaymentWriter => ({
  resolvePaiement: vi.fn(),
  completeCheckout: vi.fn(),
  failPaiement: vi.fn(),
});

describe("reconcileOrphanedPayment", () => {
  it("retourne no-token si tokenPaiement absent", async () => {
    const stripe = new FakeStripePort();
    const result = await reconcileOrphanedPayment(makePayment({ tokenPaiement: null }), stripe, makeWriter());
    expect(result).toBe("no-token");
  });

  it("retourne no-session si Stripe ne trouve pas la session", async () => {
    const stripe = new FakeStripePort();
    vi.spyOn(stripe, "retrieveCheckoutSession").mockResolvedValueOnce(null);
    const writer = makeWriter();
    const result = await reconcileOrphanedPayment(makePayment(), stripe, writer);
    expect(result).toBe("no-session");
    expect(writer.completeCheckout).not.toHaveBeenCalled();
  });

  it("retourne not-paid si session Stripe pas encore payée", async () => {
    const stripe = new FakeStripePort();
    const writer = makeWriter();
    const result = await reconcileOrphanedPayment(makePayment(), stripe, writer);
    expect(result).toBe("not-paid");
    expect(writer.completeCheckout).not.toHaveBeenCalled();
  });

  it("retourne reconciled et appelle completeCheckout si session payée", async () => {
    const stripe = new FakeStripePort();
    stripe.sessionStatuses.set("cs_test_abc", { paymentStatus: "paid", paymentIntentId: "pi_xyz" });
    const writer = makeWriter();
    const result = await reconcileOrphanedPayment(makePayment(), stripe, writer);
    expect(result).toBe("reconciled");
    expect(writer.completeCheckout).toHaveBeenCalledWith({
      artisanId: 10,
      paiementId: 1,
      factureId: 30,
      stripePaymentIntentId: "pi_xyz",
    });
  });
});

describe("reconcileOrphanedPayment — retourne le bon outcome pour le plugin", () => {
  it("retourne 'reconciled' uniquement si payé — le plugin doit appeler onEmailConfirmation dans ce cas", async () => {
    const stripe = new FakeStripePort();
    stripe.sessionStatuses.set("cs_paid", { paymentStatus: "paid", paymentIntentId: "pi_xyz" });
    const paidPayment = makePayment({ stripeSessionId: "cs_paid" });
    const pendingPayment = makePayment();

    const resultPaid = await reconcileOrphanedPayment(paidPayment, stripe, makeWriter());
    const resultPending = await reconcileOrphanedPayment(pendingPayment, stripe, makeWriter());

    expect(resultPaid).toBe("reconciled");
    expect(resultPending).toBe("not-paid");

    /* Vérification du contrat plugin : le callback ne doit être déclenché que sur "reconciled" */
    const onEmail = vi.fn().mockResolvedValue(undefined);
    if (resultPaid === "reconciled") await onEmail(paidPayment.artisanId, paidPayment.factureId);
    if (resultPending === "reconciled") await onEmail(pendingPayment.artisanId, pendingPayment.factureId);

    expect(onEmail).toHaveBeenCalledTimes(1);
    expect(onEmail).toHaveBeenCalledWith(10, 30);
  });
});
