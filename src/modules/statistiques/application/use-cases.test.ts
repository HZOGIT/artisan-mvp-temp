import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { FakeDevisStatsReader } from "../infra/devis-stats-reader-fake";
import { getDevisStats } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe("statistiques use-cases", () => {
  it("getDevisStats : agrège les lignes du tenant ; un autre tenant a ses propres stats", async () => {
    const reader = new FakeDevisStatsReader();
    reader.seed(1, [
      { statut: "accepte", totalTTC: "100.00" },
      { statut: "brouillon", totalTTC: "25.00" },
    ]);
    reader.seed(2, [{ statut: "envoye", totalTTC: "999.00" }]);
    expect(await getDevisStats(reader, ctx(1))).toEqual({
      total: 2,
      parStatut: { accepte: 1, brouillon: 1 },
      montantTotal: 125,
    });
    expect(await getDevisStats(reader, ctx(2))).toEqual({
      total: 1,
      parStatut: { envoye: 1 },
      montantTotal: 999,
    });
  });

  it("getDevisStats : tenant sans devis → zéros", async () => {
    const reader = new FakeDevisStatsReader();
    expect(await getDevisStats(reader, ctx(9))).toEqual({ total: 0, parStatut: {}, montantTotal: 0 });
  });
});
