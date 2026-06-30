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

const makeWriter = (): WebhookPaymentWriter & { completed: unknown[] } => ({
  completed: [] as unknown[],
  resolvePaiement: vi.fn(),
  completeCheckout: vi.fn(async (input) => { (makeWriter as unknown as { completed: unknown[] }).completed?.push(input); }),
  failPaiement: vi.fn(),
});

describe("reconcileOrphanedPayment", () => {
  it("retourne no-token si tokenPaiement absent", async () => {
    const stripe = new FakeStripePort();
    const writer = makeWriter();
    const result = await reconcileOrphanedPayment(makePayment({ tokenPaiement: null }), stripe, writer);
    expect(result).toBe("no-token");
    expect(writer.completeCheckout).not.toHaveBeenCalled();
  });

  it("retourne no-session si Stripe ne trouve pas la session", async () => {
    const stripe = new FakeStripePort();
    stripe.sessionStatuses.delete("cs_test_abc");
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
    const completed: unknown[] = [];
    const writer: WebhookPaymentWriter = {
      resolvePaiement: vi.fn(),
      completeCheckout: vi.fn(async (input) => { completed.push(input); }),
      failPaiement: vi.fn(),
    };
    const result = await reconcileOrphanedPayment(makePayment(), stripe, writer);
    expect(result).toBe("reconciled");
    expect(writer.completeCheckout).toHaveBeenCalledWith({
      artisanId: 10,
      paiementId: 1,
      factureId: 30,
      stripePaymentIntentId: "pi_xyz",
    });
  });

  it("appelle genererEcritures best-effort après reconcile", async () => {
    const stripe = new FakeStripePort();
    stripe.sessionStatuses.set("cs_test_abc", { paymentStatus: "paid", paymentIntentId: "pi_xyz" });
    const writer: WebhookPaymentWriter = {
      resolvePaiement: vi.fn(),
      completeCheckout: vi.fn(),
      failPaiement: vi.fn(),
    };
    const genererEcritures = vi.fn().mockRejectedValueOnce(new Error("ecritures fail"));
    const result = await reconcileOrphanedPayment(makePayment(), stripe, writer, genererEcritures);
    expect(result).toBe("reconciled");
    expect(genererEcritures).toHaveBeenCalledWith(10, 30);
  });
});
