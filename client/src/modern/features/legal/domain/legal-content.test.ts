import { describe, expect, it } from "vitest";
import { MENTIONS_LEGALES, CGU, CGV, CONFIDENTIALITE, type LegalDoc } from "./legal-content";

describe("legal-content — documents statiques", () => {
  const docs: [string, LegalDoc][] = [["mentions", MENTIONS_LEGALES], ["cgu", CGU], ["cgv", CGV], ["confidentialite", CONFIDENTIALITE]];

  it("chaque doc a titre + date + html non vide", () => {
    for (const [, d] of docs) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.html.length).toBeGreaterThan(100);
      expect(d.html).toContain("<h2>");
    }
  });

  it("marqueurs de contenu attendus", () => {
    expect(MENTIONS_LEGALES.html).toContain("Éditeur du site");
    expect(CGU.html).toContain("Article 1 — Objet");
    expect(CGV.html).toContain("Période d'essai");
    expect(CONFIDENTIALITE.html).toContain("RGPD");
    // cross-link interne CGU/CGV → confidentialité
    expect(CGU.html).toContain('href="/confidentialite"');
  });
});
