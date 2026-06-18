import { describe, it, expect } from "vitest";
import { isValidNavPage, resolveNavigation, VALID_NAV_PAGES, NAV_DEEP_LINK_RE } from "./navigation";

describe("navigation (naviguer_vers)", () => {
  it("page connue → valide ; page inconnue → invalide", () => {
    expect(isValidNavPage("/devis")).toBe(true);
    expect(isValidNavPage("/comptabilite")).toBe(true);
    expect(isValidNavPage("/inexistant")).toBe(false);
    expect(isValidNavPage("")).toBe(false);
  });

  it("deep-links : /<ressource>/<id> autorisés ; /interventions/<id> NON (pas de vue détail)", () => {
    expect(NAV_DEEP_LINK_RE.test("/devis/42")).toBe(true);
    expect(isValidNavPage("/factures/7")).toBe(true);
    expect(isValidNavPage("/clients/1")).toBe(true);
    expect(isValidNavPage("/interventions/3")).toBe(false); // pas un deep-link autorisé
    expect(isValidNavPage("/devis/abc")).toBe(false); // id non numérique
  });

  it("resolveNavigation : page valide → navigate + confirmation", () => {
    const r = resolveNavigation({ page: "/factures" });
    expect(r).toEqual({ ok: true, navigate: { page: "/factures", filtre: undefined, message: undefined }, confirmation: "Page /factures ouverte" });
  });

  it("resolveNavigation : filtre → confirmation enrichie + normalisation (trim)", () => {
    const r = resolveNavigation({ page: " /factures ".trim(), filtre: " impayees " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.navigate.filtre).toBe("impayees");
      expect(r.confirmation).toBe("Page /factures ouverte avec le filtre « impayees »");
    }
  });

  it("resolveNavigation : page invalide → erreur explicite", () => {
    const r = resolveNavigation({ page: "/n-importe-quoi" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Page invalide");
  });

  it("la whitelist couvre les 54 pages connues (cœur métier + compta + … + réglages), sans doublon", () => {
    expect(VALID_NAV_PAGES).toContain("/dashboard");
    expect(VALID_NAV_PAGES).toContain("/support");
    expect(VALID_NAV_PAGES.length).toBe(54);
    expect(new Set(VALID_NAV_PAGES).size).toBe(VALID_NAV_PAGES.length); // pas de doublon
  });
});
