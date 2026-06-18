import { describe, expect, it } from "vitest";
import { recommendedSlugs, metierFinal, buildCompletePayload, toggleSlug, MODULES_PAR_METIER, type Module } from "./onboarding";

const mods = (slugs: string[]): Module[] => slugs.map((slug, i) => ({ id: i + 1, slug, label: slug, icon: "FileText", locked: false, description: "" } as unknown as Module));

describe("onboarding — domain pur", () => {
  it("recommendedSlugs : recos du métier restreintes aux modules dispo", () => {
    const available = mods(["devis", "factures", "clients", "interventions"]); // pas de stocks/relances
    const r = recommendedSlugs("plombier", available); // plombier reco devis/factures/clients/interventions/stocks/relances
    expect(r.has("devis")).toBe(true); expect(r.has("interventions")).toBe(true);
    expect(r.has("stocks")).toBe(false); // indispo → exclu
    expect(MODULES_PAR_METIER.plombier).toContain("stocks");
  });
  it("recommendedSlugs : métier inconnu → fallback autre", () => {
    const r = recommendedSlugs("inconnu", mods(["devis", "factures", "clients"]));
    expect(r.has("devis")).toBe(true);
  });
  it("metierFinal : autre → texte libre, sinon clé", () => {
    expect(metierFinal("autre", "Couvreur")).toBe("Couvreur");
    expect(metierFinal("autre", "  ")).toBe("autre");
    expect(metierFinal("plombier", "")).toBe("plombier");
    expect(metierFinal(null, "")).toBe("");
  });
  it("buildCompletePayload : metier vide → undefined", () => {
    expect(buildCompletePayload("plombier", new Set(["devis", "factures"]))).toEqual({ metier: "plombier", moduleSlugs: ["devis", "factures"] });
    expect(buildCompletePayload("", new Set(["devis"]))).toEqual({ metier: undefined, moduleSlugs: ["devis"] });
  });
  it("toggleSlug : ajoute/retire immutablement", () => {
    const s = new Set(["a"]);
    expect([...toggleSlug(s, "b", true)]).toEqual(["a", "b"]);
    expect([...toggleSlug(s, "a", false)]).toEqual([]);
    expect([...s]).toEqual(["a"]); // immutable
  });
});
