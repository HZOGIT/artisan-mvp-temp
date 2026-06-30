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

  it("OPE-780 — session en_attente sans sessionId (legacy) → bad-request (statut Stripe non vérifiable)", async () => {
    const { reader, deps } = build();
    seedFacturePayable(reader);
    reader.seedSessionEnAttente(7, 42, { url: "https://checkout.stripe.test/existing", createdAt: new Date(NOW.getTime() - 1 * 60 * 60 * 1000) });
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("bad-request");
    if (out.kind === "bad-request") expect(out.message).toContain("en cours");
  });

  it("OPE-954 — session OPEN sur Stripe → reprend le même Checkout (pas de blocage/dup)", async () => {
    const { reader, writer, stripe, deps } = build();
    seedFacturePayable(reader);
    reader.seedSessionEnAttente(7, 42, { id: 10, url: "https://checkout.stripe.test/existing", sessionId: "cs_open", stripeConnectAccountId: "acct_test", createdAt: new Date(NOW.getTime() - 1 * 60 * 60 * 1000) });
    stripe.sessionStatuses.set("cs_open", { paymentStatus: "unpaid", paymentIntentId: null, sessionStatus: "open" });
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.sessionId).toBe("cs_open");
      expect(out.url).toBe("https://checkout.stripe.test/existing");
    }
    expect(writer.created).toHaveLength(0);
    expect(writer.expired).toHaveLength(0);
  });

  it("OPE-954 — session EXPIRÉE sur Stripe → marque expire + crée nouvelle session", async () => {
    const { reader, writer, stripe, deps } = build();
    seedFacturePayable(reader);
    reader.seedSessionEnAttente(7, 42, { id: 11, url: "https://checkout.stripe.test/old", sessionId: "cs_expired", stripeConnectAccountId: "acct_test", createdAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) });
    stripe.sessionStatuses.set("cs_expired", { paymentStatus: "unpaid", paymentIntentId: null, sessionStatus: "expired" });
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("ok");
    expect(writer.expired).toEqual([11]);
    expect(writer.created).toHaveLength(1);
    if (out.kind === "ok") expect(out.url).not.toBe("https://checkout.stripe.test/old");
  });

  it("OPE-903 — artisan sans charges_enabled → bad-request (gating Connect)", async () => {
    const { reader, deps } = build();
    reader.seedArtisanChargesEnabled(7, false);
    seedFacturePayable(reader);
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("bad-request");
    if (out.kind === "bad-request") expect(out.message).toContain("pas encore activé");
  });

  it("OPE-780 — session en_attente périmée (> 24h, Stripe expiré) → nouvelle session autorisée", async () => {
    const { reader, writer, deps } = build();
    seedFacturePayable(reader);
    reader.seedSessionEnAttente(7, 42, { url: "https://checkout.stripe.test/old", createdAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000) });
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("ok");
    expect(writer.created).toHaveLength(1);
  });

  it("succès : crée la session Stripe (mode payment) + la ligne paiement en_attente", async () => {
    const { reader, writer, stripe, deps } = build();
    seedFacturePayable(reader);
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.url).toContain("checkout.stripe.test");
    expect(stripe.invoiceCheckouts).toHaveLength(1);
    expect(stripe.invoiceCheckouts[0].montantTTC).toBe(120);
    expect(stripe.invoiceCheckouts[0].numeroFacture).toBe("FAC-1");
    expect(stripe.invoiceCheckouts[0].clientName).toBe("Jean Durand");
    expect(writer.created).toHaveLength(1);
    expect(writer.created[0].tokenPaiement).toBe(stripe.invoiceCheckouts[0].tokenPaiement);
    expect(writer.created[0].artisanId).toBe(7);
  });

  it("OPE-904 — direct charge : stripeConnectAccountId transmis au port Stripe (0 commission)", async () => {
    const { reader, stripe, deps } = build();
    reader.seedArtisanConnectAccountId(7, "acct_live_test123");
    seedFacturePayable(reader);
    await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(stripe.invoiceCheckouts).toHaveLength(1);
    expect(stripe.invoiceCheckouts[0].stripeConnectAccountId).toBe("acct_live_test123");
  });

  it("OPE-922 — snapshot compte Connect dans la ligne paiement (createPaiement reçoit stripeConnectAccountId)", async () => {
    const { reader, writer, deps } = build();
    reader.seedArtisanConnectAccountId(7, "acct_snapshot_test");
    seedFacturePayable(reader);
    await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(writer.created).toHaveLength(1);
    expect(writer.created[0].stripeConnectAccountId).toBe("acct_snapshot_test");
  });

  it("OPE-904 — garde explicite : stripeConnectAccountId vide → bad-request (charge plateforme IMPOSSIBLE)", async () => {
    const { reader, deps } = build();
    reader.seedArtisanConnectAccountId(7, "");
    seedFacturePayable(reader);
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("bad-request");
    if (out.kind === "bad-request") expect(out.message).toContain("pas encore activé");
  });

  it("OPE-807 — race TOCTOU : INSERT rejeté (UNIQUE), session existante récupérée → ok idempotent", async () => {
    const { reader, writer, deps } = build();
    seedFacturePayable(reader);
    reader.seedSessionEnAttente(7, 42, { url: "https://checkout.stripe.test/existing", sessionId: "cs_test_existing", createdAt: new Date(NOW.getTime() - 1000) });
    reader.skipFirstSessionLookup = true;
    writer.forceConflictOnce = true;
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.sessionId).toBe("cs_test_existing");
      expect(out.url).toBe("https://checkout.stripe.test/existing");
    }
    expect(writer.created).toHaveLength(0);
  });

  it("OPE-807 — race TOCTOU : INSERT rejeté, session introuvable → bad-request fallback", async () => {
    const { reader, writer, deps } = build();
    seedFacturePayable(reader);
    writer.forceConflictOnce = true;
    const out = await createInvoiceCheckout(deps, { factureId: 42, token: "tok", origin: "https://o.test" });
    expect(out.kind).toBe("bad-request");
  });
});
