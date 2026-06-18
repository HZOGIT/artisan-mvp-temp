import { describe, it, expect } from "vitest";
import { getContexteMetier, getSystemPromptMetier, CONTEXTES_METIER } from "./contexte-metier";

describe("contexte-metier", () => {
  it("normalise accents/casse pour matcher la clé", () => {
    expect(getContexteMetier("Plombier")).toBe(CONTEXTES_METIER.plombier);
    expect(getContexteMetier("ÉLECTRICIEN")).toBe(CONTEXTES_METIER.electricien);
    expect(getContexteMetier("maçon")).toBe(CONTEXTES_METIER.macon);
  });

  it("métier inconnu ou absent → contexte 'autre'", () => {
    expect(getContexteMetier("astronaute")).toBe(CONTEXTES_METIER.autre);
    expect(getContexteMetier(null)).toBe(CONTEXTES_METIER.autre);
    expect(getContexteMetier(undefined)).toBe(CONTEXTES_METIER.autre);
  });

  it("getSystemPromptMetier préfixe le contexte au prompt de base", () => {
    const p = getSystemPromptMetier("plombier", "BASE");
    expect(p.startsWith(CONTEXTES_METIER.plombier)).toBe(true);
    expect(p.endsWith("BASE")).toBe(true);
  });
});
