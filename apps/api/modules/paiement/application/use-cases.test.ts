import { describe, it, expect } from "vitest";
import { FakeStripePort } from "../../../shared/ports/stripe-adapter";
import { FakePortalPaymentReader, FakePortalPaymentWriter } from "../infra/portal-payment-reader-fake";
import { getPaiementStatut, createInvoiceCheckout } from "./use-cases";

const NOW = new Date("2026-06-15T12:00:00Z");
const facture = { clientId: 5, statut: "envoyee", totalTTC: "120.00", montantPaye: null, datePaiement: null, modePaiement: null };

describe("getPaiementStatut (public par token portail)", () => {
  it("token absent → bad-request", async () => {
    const reader = new FakePortalPaymentReader();
    expect((await getPaiementStatut(reader, { token: undefined, factureId: 1 }, NOW)).kind).toBe("bad-request");
  });

  it("accès portail inconnu/expiré → forbidden", async () => {
    const reader = new FakePortalPaymentReader();
    expect((await getPaiementStatut(reader, { token: "absent", factureId: 1 }, NOW)).kind).toBe("forbidden");
  });

  it("facture inexistante → not-found", async () => {
    const reader = new FakePortalPaymentReader();
    reader.seedAccess("tok", { clientId: 5, artisanId: 7 });
    expect((await getPaiementStatut(reader, { token: "tok", factureId: 99 }, NOW)).kind).toBe("not-found");
  });

  it("facture d'un AUTRE client (que celui de l'accès) → not-found (anti-IDOR)", async () => {
    const reader = new FakePortalPaymentReader();
    reader.seedAccess("tok", { clientId: 5, artisanId: 7 });
    reader.seedFacture(7, 42, { ...facture, clientId: 6 }); // facture du client 6, pas 5
    expect((await getPaiementStatut(reader, { token: "tok", factureId: 42 }, NOW)).kind).toBe("not-found");
  });

  it("succès : statut facture + dernier paiement", async () => {
    const reader = new FakePortalPaymentReader();
    reader.seedAccess("tok", { clientId: 5, artisanId: 7 });
    reader.seedFacture(7, 42, facture);
    reader.seedPaiement(7, 42, { statut: "en_attente", paidAt: null });
    const out = await getPaiementStatut(reader, { token: "tok", factureId: 42 }, NOW);
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.payload).toMatchObject({ factureId: 42, statutFacture: "envoyee", montantTTC: "120.00" });
      expect(out.payload.dernierPaiement).toEqual({ statut: "en_attente", paidAt: null });
    }
  });

  it("succès sans paiement enregistré → dernierPaiement null", async () => {
    const reader = new FakePortalPaymentReader();
    reader.seedAccess("tok", { clientId: 5, artisanId: 7 });
    reader.seedFacture(7, 42, facture);
    const out = await getPaiementStatut(reader, { token: "tok", factureId: 42 }, NOW);
    if (out.kind === "ok") expect(out.payload.dernierPaiement).toBeNull();
  });
});

describe("createInvoiceCheckout (public par token portail)", () => {
  function build() {
    const reader = new FakePortalPaymentReader();
    const writer = new FakePortalPaymentWriter();
    const stripe = new FakeStripePort();
    reader.seedAccess("tok", { clientId: 5, artisanId: 7 });
    reader.seedContact(7, 5, { email: "c@test.com", nom: "Durand", prenom: "Jean" });
    reader.seedArtisanNom(7, "Plomberie X");
    return { reader, writer, stripe, deps: { reader, writer, stripe, maintenant: () => NOW } };
  }
  const seedFacturePayable = (reader: FakePortalPaymentReader, statut = "envoyee") =>
    reader.seedCheckout(7, 42, { clientId: 5, numero: "FAC-1", statut, totalTTC: "120.00" });

  it("body incomplet (pas de token) → bad-request", async () => {
    const { deps } = build();
    expect((await createInvoiceCheckout(deps, { factureId: 42, token: undefined, origin: "https://o.test" })).kind).toBe("bad-request");
  });

  it("accès inconnu → forbidden", async () => {
    const { deps } = build();
    expect((await createInvoiceCheckout(deps, { factureId: 42, token: "absent", origin: "https://o.test" })).kind).toBe("forbidden");
  });

  it("facture d'un autre client → not-found (anti-IDOR)", async () => {
    const { reader, deps } = build();
    reader.seedCheckout(7, 42, { clientId: 99, numero: "FAC-1", statut: "envoyee", totalTTC: "120.00" });
    expect((await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" })).kind).toBe("not-found");
  });

  it("facture déjà payée → bad-request ; brouillon/annulée → bad-request (non payable)", async () => {
    const { reader, deps } = build();
    reader.seedCheckout(7, 42, { clientId: 5, numero: "FAC-1", statut: "payee", totalTTC: "120.00" });
    expect((await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" })).kind).toBe("bad-request");
    reader.seedCheckout(7, 43, { clientId: 5, numero: "FAC-2", statut: "brouillon", totalTTC: "50.00" });
    expect((await createInvoiceCheckout(deps, { factureId: 43, token: "tok", origin: "https://o.test" })).kind).toBe("bad-request");
  });

  it("OPE-780 — session en_attente existante → bad-request (anti double-encaissement)", async () => {
    const { reader, deps } = build();
    seedFacturePayable(reader);
    reader.seedSessionEnAttente(7, 42, { url: "https://checkout.stripe.test/existing" });
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("bad-request");
    if (out.kind === "bad-request") expect(out.message).toContain("en cours");
  });

  it("succès : crée la session Stripe (mode payment) + la ligne paiement en_attente", async () => {
    const { reader, writer, stripe, deps } = build();
    seedFacturePayable(reader);
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.url).toContain("checkout.stripe.test");
    // Stripe appelé avec le bon montant en euros + metadata cohérente (token_paiement)
    expect(stripe.invoiceCheckouts).toHaveLength(1);
    expect(stripe.invoiceCheckouts[0].montantTTC).toBe(120);
    expect(stripe.invoiceCheckouts[0].numeroFacture).toBe("FAC-1");
    expect(stripe.invoiceCheckouts[0].clientName).toBe("Jean Durand");
    // ligne paiements_stripe créée avec le MÊME token que la metadata Stripe (cohérence webhook)
    expect(writer.created).toHaveLength(1);
    expect(writer.created[0].tokenPaiement).toBe(stripe.invoiceCheckouts[0].tokenPaiement);
    expect(writer.created[0].artisanId).toBe(7);
  });
});
