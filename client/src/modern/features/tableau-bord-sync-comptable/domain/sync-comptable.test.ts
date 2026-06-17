import { describe, expect, it } from "vitest";
import { computeStats, computeChartData, statutVariant, typeLabelKey, type SyncRow } from "./sync-comptable";

const now = new Date("2026-06-17T12:00:00Z");
const row = (id: number, daysAgo: number, statut: string, nb = 0): SyncRow =>
  ({ id, statut, nombreEcritures: nb, logiciel: "sage", createdAt: new Date(now.getTime() - daysAgo * 86400_000) } as unknown as SyncRow);

describe("sync-comptable — domain pur", () => {
  it("computeStats : totaux + taux + écritures (période 30j)", () => {
    const logs = [row(1, 2, "termine"), row(2, 5, "erreur")];
    const exps = [row(3, 1, "termine", 12), row(4, 40, "termine", 99)]; // le 4 hors période 30j
    const s = computeStats(logs, exps, { periode: "30j", statut: "tous", type: "tous" }, now);
    expect(s.totalSyncs).toBe(3); // 2 logs + 1 export dans la fenêtre
    expect(s.syncsReussies).toBe(2); // 1 log termine + 1 export termine
    expect(s.syncsErreur).toBe(1);
    expect(s.totalEcritures).toBe(12);
    expect(s.tauxReussite).toBeCloseTo((2 / 3) * 100);
    expect(s.logsRecents).toHaveLength(3);
  });

  it("computeStats : type=export ne garde que les exports", () => {
    const s = computeStats([row(1, 1, "termine")], [row(2, 1, "termine")], { periode: "30j", statut: "tous", type: "export" }, now);
    expect(s.totalSyncs).toBe(1);
    expect(s.logsRecents[0].sourceType).toBe("export");
  });

  it("computeStats : filtre statut erreur", () => {
    const s = computeStats([row(1, 1, "termine"), row(2, 1, "erreur")], [], { periode: "30j", statut: "erreur", type: "tous" }, now);
    expect(s.totalSyncs).toBe(1);
  });

  it("computeChartData : 7 points sur 7j", () => {
    expect(computeChartData([], [], { periode: "7j", statut: "tous", type: "tous" }, now)).toHaveLength(7);
  });

  it("statutVariant / typeLabelKey", () => {
    expect(statutVariant("termine")).toBe("default");
    expect(statutVariant("erreur")).toBe("destructive");
    expect(statutVariant("en_cours")).toBe("secondary");
    expect(typeLabelKey("export")).toBe("typeExport");
    expect(typeLabelKey("sync")).toBe("typeSync");
  });
});
