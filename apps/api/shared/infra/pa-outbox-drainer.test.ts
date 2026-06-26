import { describe, it, expect } from "vitest";
import { drainEntry, MAX_TENTATIVES } from "./pa-outbox-drainer";
import { FakePaAdapter } from "../../modules/einvoicing/infra/fake-pa-adapter";

describe("drainEntry", () => {
  it("pending → sent sur succès PA", async () => {
    const pa = new FakePaAdapter();
    const updates: Array<{ id: number; statut: string }> = [];
    await drainEntry(
      { id: 1, artisanId: 42, factureId: 99, tentatives: 0 },
      pa,
      async (id, set) => { updates.push({ id, statut: set.statut }); },
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
    );
    expect(updates[0]?.statut).toBe("dead");
    expect(updates[0]?.tentatives).toBe(MAX_TENTATIVES);
  });
});
