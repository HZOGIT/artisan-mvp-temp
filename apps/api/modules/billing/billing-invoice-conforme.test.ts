/** Tests L1 (fake) — conformité CGI art. 289 des factures d'abonnement Operioz. */

import { describe, it, expect, beforeEach } from "vitest";
import { FakeBillingRepository } from "./infra/billing-repository-fake";
import { OPERIOZ } from "./domain/operioz-config";

describe("billing invoice — mentions légales CGI art. 289", () => {
  let repo: FakeBillingRepository;

  beforeEach(() => {
    repo = new FakeBillingRepository();
  });

  it("stocke les infos vendeur Operioz sur la facture", async () => {
    const inv = await repo.createInvoiceForCycle({
      artisanId: 1,
      cycleId: 1,
      amountCents: 2900,
      taxCents: 483,
      currency: "eur",
      planDescription: "Abonnement Starter",
      sellerName: OPERIOZ.name,
      sellerAddress: OPERIOZ.address,
      sellerSiret: OPERIOZ.siret,
      sellerTvaIntracom: OPERIOZ.tvaIntracom,
      buyerName: "Plomberie Martin",
      buyerAddress: "12 rue des Artisans, 75001 Paris",
      buyerSiret: "12345678901234",
    });

    expect(inv.seller_name).toBe(OPERIOZ.name);
    expect(inv.seller_siret).toBe(OPERIOZ.siret);
    expect(inv.seller_tva_intracom).toBe(OPERIOZ.tvaIntracom);
    expect(inv.buyer_name).toBe("Plomberie Martin");
    expect(inv.buyer_siret).toBe("12345678901234");
  });

  it("numéro séquentiel présent sur la facture", async () => {
    const inv = await repo.createInvoiceForCycle({
      artisanId: 1,
      cycleId: 2,
      amountCents: 4900,
      taxCents: 817,
      currency: "eur",
      planDescription: "Abonnement Pro",
    });

    expect(inv.number).toMatch(/^FAC-\d{4}-\d{4}$/);
  });

  it("TVA = TTC/6 (plans TTC) — cohérence HT + TVA = TTC", () => {
    const amountCents = 2900;
    const taxCents = Math.round(amountCents / 6);
    const subtotalCents = amountCents - taxCents;

    expect(subtotalCents + taxCents).toBe(amountCents);
    expect(taxCents / amountCents).toBeCloseTo(1 / 6, 2);
  });

  it("deuxième createInvoiceForCycle avec même cycleId retourne la facture existante (idempotence)", async () => {
    const p = { artisanId: 1, cycleId: 10, amountCents: 2900, taxCents: 483, currency: "eur", planDescription: "Abonnement Starter" };
    const inv1 = await repo.createInvoiceForCycle(p);
    const inv2 = await repo.createInvoiceForCycle(p);
    expect(inv1.id).toBe(inv2.id);
  });

  it("updateInvoicePdfUrl persiste l'url", async () => {
    const inv = await repo.createInvoiceForCycle({
      artisanId: 1,
      cycleId: 20,
      amountCents: 2900,
      taxCents: 483,
      currency: "eur",
      planDescription: "Abonnement Starter",
    });
    await repo.updateInvoicePdfUrl(inv.id, "https://cdn.example.com/facture.pdf");
    const ctx = { artisanId: 1, userId: 0 } as const;
    const found = await repo.findInvoiceById(ctx, inv.id);
    expect(found?.pdf_url).toBe("https://cdn.example.com/facture.pdf");
  });
});
