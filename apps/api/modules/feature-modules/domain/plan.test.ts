import { describe, it, expect } from "vitest";
import { enrichirModules, isPlanInsuffisant } from "./plan";
import type { ModuleCatalogue } from "./module";

const mod = (slug: string, planMinimum: string, actifParDefaut = false, ordre = 0): ModuleCatalogue => ({
  id: ordre + 1,
  slug,
  label: slug,
  description: null,
  icon: "x",
  categorie: "c",
  planMinimum,
  actifParDefaut,
  ordre,
});

describe("plan", () => {
  it("isPlanInsuffisant : hiérarchie essentiel < pro < entreprise", () => {
    expect(isPlanInsuffisant("pro", "essentiel")).toBe(true);
    expect(isPlanInsuffisant("pro", "pro")).toBe(false);
    expect(isPlanInsuffisant("essentiel", "pro")).toBe(false);
    expect(isPlanInsuffisant("entreprise", "pro")).toBe(true);
    // Plan inconnu/null → traité comme essentiel.
    expect(isPlanInsuffisant("pro", null)).toBe(true);
    expect(isPlanInsuffisant("inconnu", "essentiel")).toBe(false); // module à plan inconnu → seuil 0
  });

  it("enrichirModules : actif (slugs) + locked (plan), ordre conservé", () => {
    const catalogue = [mod("a", "essentiel", true, 0), mod("b", "pro", false, 1)];
    const out = enrichirModules(catalogue, ["a"], "essentiel");
    expect(out.map((m) => m.slug)).toEqual(["a", "b"]);
    expect(out.find((m) => m.slug === "a")).toMatchObject({ actif: true, locked: false });
    // b exige pro, tenant essentiel → locked ; pas dans les slugs actifs → actif false.
    expect(out.find((m) => m.slug === "b")).toMatchObject({ actif: false, locked: true });
  });
});
