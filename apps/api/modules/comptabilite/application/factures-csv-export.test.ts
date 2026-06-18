import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import type { FactureCsvRow } from "../domain/csv-export";
import type { FacturesCsvReader } from "./factures-csv-reader";
import type { Periode } from "./comptabilite-reader";
import { getFacturesCsvExport } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const NOW = new Date("2026-06-15T12:00:00Z");

class FakeCsvReader implements FacturesCsvReader {
  public lastPeriode?: Periode;
  constructor(private readonly rows: FactureCsvRow[]) {}
  async listFacturesPeriode(_ctx: TenantContext, p: Periode): Promise<FactureCsvRow[]> {
    this.lastPeriode = p;
    return this.rows;
  }
}

describe("getFacturesCsvExport", () => {
  it("génère le CSV + nom de fichier ; période par défaut = année fiscale", async () => {
    const reader = new FakeCsvReader([
      { dateFacture: new Date("2026-06-10T00:00:00"), numero: "FAC-1", clientNom: "Durand", totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00", statut: "payee" },
    ]);
    const exp = await getFacturesCsvExport(reader, ctx(1), undefined, () => NOW);
    expect(exp.fileName).toMatch(/^factures_20260101_20260615\.csv$/);
    expect(exp.content).toContain("FAC-1");
    expect(exp.content).toContain("Date;Numéro;Client;HT;TVA;TTC;Statut");
    // période par défaut : 1er janvier → maintenant (fin de journée)
    expect(reader.lastPeriode?.dateDebut.getMonth()).toBe(0);
  });

  it("respecte les bornes de date fournies", async () => {
    const reader = new FakeCsvReader([]);
    await getFacturesCsvExport(reader, ctx(1), { dateDebut: new Date("2026-03-01"), dateFin: new Date("2026-03-31") }, () => NOW);
    expect(reader.lastPeriode?.dateDebut.toISOString()).toContain("2026-03-01");
  });
});
