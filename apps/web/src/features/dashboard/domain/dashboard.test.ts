import { describe, expect, it } from "vitest";
import {
  formatEUR, computeDashboardState, resolveWidgetOrder, parseHidden, visibleWidgetIds, firstNameOf, DEFAULT_ORDER,
} from "./dashboard";

describe("computeDashboardState", () => {
  it("nouveau si <3 clients ET <3 devis", () => {
    expect(computeDashboardState(0, 0)).toBe("nouveau");
    expect(computeDashboardState(2, 2)).toBe("nouveau");
  });
  it("confirmé si >10 clients OU >10 devis", () => {
    expect(computeDashboardState(11, 0)).toBe("confirme");
    expect(computeDashboardState(0, 11)).toBe("confirme");
  });
  it("démarrage sinon", () => {
    expect(computeDashboardState(5, 5)).toBe("demarrage");
    expect(computeDashboardState(3, 0)).toBe("demarrage");
  });
});

describe("resolveWidgetOrder", () => {
  const all = ["a", "b", "c"];
  it("null/invalide → ordre par défaut", () => {
    expect(resolveWidgetOrder(null, all)).toEqual(all);
    expect(resolveWidgetOrder("pas-du-json", all)).toEqual(all);
    expect(resolveWidgetOrder('{"x":1}', all)).toEqual(all);
  });
  it("garde l'ordre sauvé valide + append les nouveaux ids en fin", () => {
    expect(resolveWidgetOrder('["c","a"]', all)).toEqual(["c", "a", "b"]);
    expect(resolveWidgetOrder('["b","zzz","a"]', all)).toEqual(["b", "a", "c"]); // ignore id inconnu
  });
});

describe("parseHidden", () => {
  it("liste de strings, sinon vide", () => {
    expect(parseHidden('["a","b"]')).toEqual(["a", "b"]);
    expect(parseHidden(null)).toEqual([]);
    expect(parseHidden("{}")).toEqual([]);
    expect(parseHidden('["a",3]')).toEqual(["a"]);
  });
});

describe("visibleWidgetIds", () => {
  it("retire masqués + ids inconnus, garde l'ordre", () => {
    expect(visibleWidgetIds(["a", "b", "c"], new Set(["b"]), ["a", "b", "c"])).toEqual(["a", "c"]);
    expect(visibleWidgetIds(["a", "zzz", "c"], new Set(), ["a", "b", "c"])).toEqual(["a", "c"]);
  });
});

describe("firstNameOf", () => {
  it("premier mot, null si vide", () => {
    expect(firstNameOf("Jean Dupont")).toBe("Jean");
    expect(firstNameOf("  Marie  ")).toBe("Marie");
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe("formatEUR / DEFAULT_ORDER", () => {
  it("formate sans décimales + 11 widgets", () => {
    expect(formatEUR(1234)).toContain("234");
    expect(DEFAULT_ORDER).toHaveLength(11);
  });
});
