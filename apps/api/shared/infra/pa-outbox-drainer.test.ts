import { describe, it, expect } from "vitest";
import { drainEntry, MAX_TENTATIVES } from "./pa-outbox-drainer";
import { FakePaAdapter } from "../../modules/einvoicing/infra/fake-pa-adapter";
import type { PaInvoicePayload } from "../../modules/einvoicing/domain/einvoicing";

const fakePayload: PaInvoicePayload = {
  typeDocument: "facture",
  numero: "FAC-001",
  date: "2026-01-15",
  emetteur: { siret: null, nom: "Test", email: null, adresse: null, codePostal: null, ville: null },
  destinataire: { siret: null, nom: "Client", email: null, adresse: null, codePostal: null, ville: null },
  lignes: [],
  tvaBreakdown: [],
  totalHT: "0.00",
  totalTva: "0.00",
  totalTTC: "0.00",
};

const loadPayload = async (): Promise<PaInvoicePayload> => fakePayload;
const loadPaEntityId = async (): Promise<string> => "fake-entity-42";

describe("drainEntry", () => {
  it("pending → sent sur succès PA", async () => {
    const pa = new FakePaAdapter();
    const updates: Array<{ id: number; statut: string }> = [];
    await drainEntry(
      { id: 1, artisanId: 42, factureId: 99, tentatives: 0 },
      pa,
      async (id, set) => { updates.push({ id, statut: set.statut }); },
      loadPayload,
      loadPaEntityId,
    );
    expect(updates).toEqual([{ id: 1, statut: "sent" }]);
  });

  it("failed → tentatives++ ; dead si MAX_TENTATIVES atteint", async () => {
    const pa = new FakePaAdapter();
    pa.submitInvoice = async () => { throw new Error("PA indisponible"); };
    const updates: Array<{ statut: string; tentatives?: number }> = [];
    await drainEntry(
      { id: 2, artisanId: 42, factureId: 100, tentatives: MAX_TENTATIVES - 1 },
      pa,
      async (_id, set) => { updates.push({ statut: set.statut, tentatives: set.tentatives }); },
      loadPayload,
      loadPaEntityId,
    );
    expect(updates[0]?.statut).toBe("dead");
    expect(updates[0]?.tentatives).toBe(MAX_TENTATIVES);
  });

  it("artisan non provisionné → dead sans appel PA", async () => {
    const pa = new FakePaAdapter();
    let submitted = false;
    pa.submitInvoice = async () => { submitted = true; return { paDocumentId: "x", statut: "soumis" }; };
    const updates: Array<{ statut: string; derniereErreur?: string }> = [];
    await drainEntry(
      { id: 3, artisanId: 99, factureId: 101, tentatives: 0 },
      pa,
      async (_id, set) => { updates.push({ statut: set.statut, derniereErreur: set.derniereErreur }); },
      loadPayload,
      async () => null,
    );
    expect(submitted).toBe(false);
    expect(updates[0]?.statut).toBe("dead");
    expect(updates[0]?.derniereErreur).toBe("artisan non provisionné PA");
  });
});
