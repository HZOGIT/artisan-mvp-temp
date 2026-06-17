import { describe, expect, it } from "vitest";
import { humanizeColumn, favoris, formatCell, deriveColonnes, TYPE_VALUES, type Rapport } from "./rapports";

describe("rapports — domain pur", () => {
  it("humanizeColumn : sépare le camelCase", () => {
    expect(humanizeColumn("montantTTC")).toBe("montant T T C");
    expect(humanizeColumn("dateDebut")).toBe("date Debut");
    expect(humanizeColumn("nom")).toBe("nom");
  });

  it("favoris : ne garde que r.favori", () => {
    const list = [{ id: 1, favori: true }, { id: 2, favori: false }] as unknown as Rapport[];
    expect(favoris(list).map((r) => r.id)).toEqual([1]);
  });

  it("formatCell : Date → JJ/MM/AAAA, nombre formaté, null → -", () => {
    expect(formatCell(new Date("2026-01-13T00:00:00"))).toContain("2026");
    expect(formatCell(1234.5)).toContain("1");
    expect(formatCell(null)).toBe("-");
    expect(formatCell("texte")).toBe("texte");
  });

  it("deriveColonnes : clés de la 1re ligne, [] si vide", () => {
    expect(deriveColonnes([{ a: 1, b: 2 }])).toEqual(["a", "b"]);
    expect(deriveColonnes([])).toEqual([]);
  });

  it("TYPE_VALUES : 6 types affichés (parité)", () => {
    expect(TYPE_VALUES).toHaveLength(6);
  });
});
