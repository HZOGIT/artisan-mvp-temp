import { describe, it, expect } from "vitest";
import { genererFecAchats, exportFecAchats } from "./fec";
import { FakeFecReader } from "../infra/fec-reader-fake";
import type { FecDepense, ConfigComptable } from "../domain/fec";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const CONFIG: ConfigComptable = { compteAchats: "607000", compteTVADeductible: "445660", compteFournisseurs: "401000", journalAchats: "AC" };
const dep = (over: Partial<FecDepense> = {}): FecDepense => ({
  id: 1,
  numero: "DEP-00001",
  dateDepense: "2026-03-15",
  fournisseur: "ACME",
  montantHt: "100.00",
  montantTva: "20.00",
  montantTtc: "120.00",
  description: "Fournitures",
  ...over,
});

// Somme la colonne Débit (11) ou Crédit (12) des lignes de données (hors header), virgule→point.
function totalColonne(fec: string, col: 11 | 12): number {
  return fec
    .split("\n")
    .slice(1)
    .reduce((s, l) => s + Number((l.split("\t")[col] || "0").replace(",", ".")), 0);
}

describe("depenses — genererFecAchats (pur)", () => {
  it("3 lignes par dépense (Achats/TVA débit, Fournisseurs crédit) + en-tête 18 colonnes", () => {
    const fec = genererFecAchats([dep()], CONFIG);
    const lignes = fec.split("\n");
    expect(lignes[0].split("\t")).toHaveLength(18);
    expect(lignes).toHaveLength(4); // header + 3
    const [achats, tva, fourn] = lignes.slice(1).map((l) => l.split("\t"));
    expect(achats[4]).toBe("607000"); // CompteNum Achats
    expect(achats[11]).toBe("100,00"); // Débit HT
    expect(tva[4]).toBe("445660"); // TVA déductible
    expect(tva[11]).toBe("20,00"); // Débit TVA
    expect(fourn[4]).toBe("401000"); // Fournisseurs
    expect(fourn[12]).toBe("120,00"); // Crédit TTC
    expect(achats[0]).toBe("AC"); // JournalCode
    expect(achats[3]).toBe("20260315"); // EcritureDate YYYYMMDD
  });

  it("⚠️ INVARIANT FEC : total Débit = total Crédit (équilibre comptable)", () => {
    const fec = genererFecAchats(
      [dep({ id: 1, montantHt: "100.00", montantTva: "20.00", montantTtc: "120.00" }), dep({ id: 2, numero: "DEP-00002", montantHt: "50.00", montantTva: "10.00", montantTtc: "60.00" })],
      CONFIG,
    );
    expect(totalColonne(fec, 11)).toBeCloseTo(totalColonne(fec, 12), 2); // 180 == 180
    expect(totalColonne(fec, 11)).toBeCloseTo(180, 2);
  });

  it("EcritureNum incrémente par dépense ; aucune dépense → en-tête seul", () => {
    const fec = genererFecAchats([dep({ id: 1 }), dep({ id: 2, numero: "DEP-2" })], CONFIG);
    const nums = fec.split("\n").slice(1).map((l) => l.split("\t")[2]);
    expect(nums).toEqual(["1", "1", "1", "2", "2", "2"]);
    expect(genererFecAchats([], CONFIG).split("\n")).toHaveLength(1);
  });
});

describe("depenses — exportFecAchats use-case", () => {
  it("lit les déductibles de la période + la config, scopé tenant", async () => {
    const reader = new FakeFecReader();
    reader.seedDepense(1, dep({ id: 1, dateDepense: "2026-03-10" }), true);
    reader.seedDepense(1, dep({ id: 2, numero: "DEP-2", dateDepense: "2026-03-20" }), true);
    reader.seedDepense(1, dep({ id: 3, numero: "DEP-3", dateDepense: "2026-05-01" }), true); // hors période
    reader.seedDepense(1, dep({ id: 4, numero: "DEP-4", dateDepense: "2026-03-12" }), false); // non déductible
    reader.seedDepense(2, dep({ id: 5, numero: "DEP-B", dateDepense: "2026-03-15" }), true); // autre tenant
    const { contenu } = await exportFecAchats(reader, A, "2026-03-01", "2026-03-31");
    const lignes = contenu.split("\n");
    expect(lignes).toHaveLength(1 + 2 * 3); // header + 2 dépenses × 3 lignes
    expect(contenu).toContain("DEP-00001");
    expect(contenu).toContain("DEP-2");
    expect(contenu).not.toContain("DEP-3"); // hors période
    expect(contenu).not.toContain("DEP-4"); // non déductible
    expect(contenu).not.toContain("DEP-B"); // autre tenant
    // équilibre
    expect(totalColonne(contenu, 11)).toBeCloseTo(totalColonne(contenu, 12), 2);
    // B : aucune dépense (réinitialisé) → header seul
    expect((await exportFecAchats(reader, B, "2026-03-01", "2026-03-31")).contenu.split("\n")).toHaveLength(1 + 3);
  });

  it("config comptable personnalisée respectée", async () => {
    const reader = new FakeFecReader();
    reader.setConfig(1, { compteAchats: "601000", compteTVADeductible: "445662", compteFournisseurs: "401100", journalAchats: "HA" });
    reader.seedDepense(1, dep(), true);
    const { contenu } = await exportFecAchats(reader, A, "2026-03-01", "2026-03-31");
    expect(contenu).toContain("601000");
    expect(contenu).toContain("HA\tAchats\t"); // JournalCode HA + JournalLib (ligne de données)
  });
});
