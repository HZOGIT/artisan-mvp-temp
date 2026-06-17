import { describe, expect, it } from "vitest";
import {
  filterStocks,
  isLowStock,
  totalStockValue,
  indexEntrantByStock,
  previsionnel,
  type Stock,
  type StockEntrant,
} from "./stock";

const mk = (p: Partial<Stock> & { id: number }): Stock =>
  ({ reference: "", designation: "", fournisseur: "", quantiteEnStock: "0", seuilAlerte: "0", prixAchat: "0", unite: "unité", ...p } as unknown as Stock);
const mkE = (stockId: number, entrant: number): StockEntrant =>
  ({ stockId, entrant } as unknown as StockEntrant);

describe("filterStocks", () => {
  const list = [
    mk({ id: 1, reference: "TUB-12", designation: "Tube cuivre", fournisseur: "Plombco" }),
    mk({ id: 2, reference: "VIS-30", designation: "Vis inox", fournisseur: "Quincaillerie" }),
  ];
  it("recherche référence / désignation / fournisseur", () => {
    expect(filterStocks(list, "cuivre").map((s) => s.id)).toEqual([1]);
    expect(filterStocks(list, "VIS").map((s) => s.id)).toEqual([2]);
    expect(filterStocks(list, "quincaillerie").map((s) => s.id)).toEqual([2]);
  });
});

describe("isLowStock", () => {
  it("vrai quand quantité <= seuil", () => {
    expect(isLowStock({ quantiteEnStock: "3", seuilAlerte: "5" })).toBe(true);
    expect(isLowStock({ quantiteEnStock: "5", seuilAlerte: "5" })).toBe(true);
    expect(isLowStock({ quantiteEnStock: "6", seuilAlerte: "5" })).toBe(false);
  });
});

describe("totalStockValue", () => {
  it("somme quantité × prix d'achat", () => {
    const list = [mk({ id: 1, quantiteEnStock: "10", prixAchat: "2.50" }), mk({ id: 2, quantiteEnStock: "4", prixAchat: "5" })];
    expect(totalStockValue(list)).toBeCloseTo(45); // 25 + 20
  });
  it("tolère les valeurs non numériques", () => {
    expect(totalStockValue([mk({ id: 1, quantiteEnStock: "abc", prixAchat: "x" })])).toBe(0);
  });
});

describe("indexEntrantByStock / previsionnel", () => {
  it("indexe l'entrant par stockId et calcule le prévisionnel", () => {
    const map = indexEntrantByStock([mkE(1, 5), mkE(2, 3)]);
    expect(map.get(1)).toBe(5);
    expect(map.get(99)).toBeUndefined();
    expect(previsionnel({ quantiteEnStock: "10" }, map.get(1) ?? 0)).toBe(15);
    expect(previsionnel({ quantiteEnStock: "10" }, 0)).toBe(10);
  });
});
