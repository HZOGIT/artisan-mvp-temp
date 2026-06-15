import { describe, it, expect } from "vitest";
import { FakePortalPaymentReader } from "../infra/portal-payment-reader-fake";
import { getPaiementStatut } from "./use-cases";

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
