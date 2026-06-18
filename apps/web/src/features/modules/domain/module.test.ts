import { describe, expect, it } from "vitest";
import {
  toCategorie,
  toPlan,
  filterByCategorie,
  popularModules,
  moduleCounts,
  progressPct,
  countByCategorie,
  CATEGORIES,
  PLANS,
  type Module,
} from "./module";

const mk = (p: Partial<Module> & { id: number; slug: string }): Module =>
  ({ label: "", description: null, icon: "Bell", categorie: "gestion", planMinimum: "essentiel", actif: false, locked: false, ordre: 0, actifParDefaut: false, ...p } as unknown as Module);

describe("toCategorie / toPlan", () => {
  it("garde un membre connu, sinon défaut", () => {
    expect(CATEGORIES).toContain("ia");
    expect(PLANS).toContain("pro");
    expect(toCategorie("commercial")).toBe("commercial");
    expect(toCategorie("inconnu")).toBe("parametres");
    expect(toPlan("entreprise")).toBe("entreprise");
    expect(toPlan("zzz")).toBe("essentiel");
  });
});

describe("filterByCategorie", () => {
  const list = [mk({ id: 1, slug: "a", categorie: "commercial" }), mk({ id: 2, slug: "b", categorie: "ia" }), mk({ id: 3, slug: "c", categorie: "commercial" })];
  it("'all' = tout, sinon par catégorie", () => {
    expect(filterByCategorie(list, "all")).toHaveLength(3);
    expect(filterByCategorie(list, "commercial").map((m) => m.id)).toEqual([1, 3]);
  });
});

describe("popularModules", () => {
  it("retourne les modules présents dans l'ordre des slugs", () => {
    const list = [mk({ id: 1, slug: "devis" }), mk({ id: 2, slug: "clients" }), mk({ id: 3, slug: "autre" })];
    expect(popularModules(list, ["clients", "devis", "absent"]).map((m) => m.slug)).toEqual(["clients", "devis"]);
  });
});

describe("moduleCounts / progressPct", () => {
  it("compte actifs/total et le %", () => {
    const list = [mk({ id: 1, slug: "a", actif: true }), mk({ id: 2, slug: "b", actif: false }), mk({ id: 3, slug: "c", actif: true })];
    expect(moduleCounts(list)).toEqual({ actifs: 2, total: 3 });
    expect(progressPct({ actifs: 2, total: 3 })).toBeCloseTo(66.666, 1);
  });
  it("liste vide → total 15 (legacy), 0%", () => {
    expect(moduleCounts([])).toEqual({ actifs: 0, total: 15 });
    expect(progressPct({ actifs: 0, total: 15 })).toBe(0);
  });
});

describe("countByCategorie", () => {
  it("compte par catégorie", () => {
    const list = [mk({ id: 1, slug: "a", categorie: "ia" }), mk({ id: 2, slug: "b", categorie: "ia" }), mk({ id: 3, slug: "c", categorie: "clients" })];
    expect(countByCategorie(list, "ia")).toBe(2);
    expect(countByCategorie(list, "terrain")).toBe(0);
  });
});
