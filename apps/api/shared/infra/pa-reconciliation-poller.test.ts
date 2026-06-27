import { describe, it, expect } from "vitest";
import { reconcileFactureEvents } from "./pa-reconciliation-poller";
import type { LifecycleEvent } from "../../modules/einvoicing/domain/einvoicing";
import type { InsertFactureCycleVieEvent } from "../../../../drizzle/schema/einvoicing";

const ts1 = new Date("2026-01-01T10:00:00Z");
const ts2 = new Date("2026-01-01T12:00:00Z");

describe("reconcileFactureEvents", () => {
  it("0 events → null, aucun insert", async () => {
    let insertCalled = false;
    const result = await reconcileFactureEvents([], 1, 10, async () => { insertCalled = true; });
    expect(result).toBeNull();
    expect(insertCalled).toBe(false);
  });

  it("2 events → retourne le statut du plus récent (terminal)", async () => {
    const events: LifecycleEvent[] = [
      { paDocumentId: "doc-1", statut: "deposee", timestamp: ts1 },
      { paDocumentId: "doc-1", statut: "rejetee", timestamp: ts2 },
    ];
    const result = await reconcileFactureEvents(events, 1, 10, async () => {});
    expect(result).toBe("rejetee");
  });

  it("paEventId synthétique est déterministe — même event au re-poll → même clé", async () => {
    const events: LifecycleEvent[] = [
      { paDocumentId: "doc-abc", statut: "approuvee", timestamp: ts1 },
    ];
    const keys: string[] = [];
    const capture = async (v: InsertFactureCycleVieEvent) => { keys.push(v.paEventId ?? ""); };
    await reconcileFactureEvents(events, 1, 10, capture);
    await reconcileFactureEvents(events, 1, 10, capture);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^reconcil:/);
  });

  it("insert no-op (paEventId déjà connu) → pas d'erreur, retourne le statut", async () => {
    const events: LifecycleEvent[] = [
      { paDocumentId: "doc-dup", statut: "approuvee", timestamp: ts1 },
    ];
    /* simule ON CONFLICT DO NOTHING : silencieux */
    await expect(
      reconcileFactureEvents(events, 1, 10, async () => {}),
    ).resolves.toBe("approuvee");
  });
});
