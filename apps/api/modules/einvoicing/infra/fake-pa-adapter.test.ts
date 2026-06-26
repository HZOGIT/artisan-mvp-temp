import { describe, it, expect } from "vitest";
import { FakePaAdapter } from "./fake-pa-adapter";

describe("FakePaAdapter", () => {
  it("roundtrip ensureEntity → submitInvoice → getLifecycle retourne 1 event soumis", async () => {
    const pa = new FakePaAdapter();

    const { paEntityId } = await pa.ensureEntity({ siret: "12345678901234", nom: "Test", email: "test@example.com" });
    expect(paEntityId).toBe("fake-entity-12345678901234");

    const { paDocumentId, statut } = await pa.submitInvoice({ paEntityId, invoiceId: 42 });
    expect(statut).toBe("soumis");

    const events = await pa.getLifecycle(paDocumentId);
    expect(events).toHaveLength(1);
    expect(events[0]?.statut).toBe("soumis");
  });

  it("ensureEntity est idempotent sur le même siret", async () => {
    const pa = new FakePaAdapter();
    const r1 = await pa.ensureEntity({ siret: "11111111111111", nom: "A", email: "a@b.com" });
    const r2 = await pa.ensureEntity({ siret: "11111111111111", nom: "A", email: "a@b.com" });
    expect(r1.paEntityId).toBe(r2.paEntityId);
  });

  it("submitInvoice est idempotent sur le même invoiceId", async () => {
    const pa = new FakePaAdapter();
    const { paEntityId } = await pa.ensureEntity({ siret: "22222222222222", nom: "B", email: "b@b.com" });
    const r1 = await pa.submitInvoice({ paEntityId, invoiceId: 99 });
    const r2 = await pa.submitInvoice({ paEntityId, invoiceId: 99 });
    expect(r1.paDocumentId).toBe(r2.paDocumentId);
  });
});
