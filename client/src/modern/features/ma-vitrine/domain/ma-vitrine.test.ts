import { describe, expect, it } from "vitest";
import { parseServices, buildVitrineUrl, avisStatutClass, avisStatutIsSecondary, formatDate } from "./ma-vitrine";

describe("ma-vitrine — domain pur", () => {
  it("parseServices : JSON tableau → multi-lignes, repli brut, vide", () => {
    expect(parseServices('["A","B"]')).toBe("A\nB");
    expect(parseServices("texte brut")).toBe("texte brut");
    expect(parseServices(null)).toBe("");
  });

  it("buildVitrineUrl : origin + slug, vide si pas de slug", () => {
    expect(buildVitrineUrl("https://x.fr", "mon-entreprise")).toBe("https://x.fr/vitrine/mon-entreprise");
    expect(buildVitrineUrl("https://x.fr", "")).toBe("");
  });

  it("avisStatutClass / secondary : publié vert, masqué secondary, sinon orange", () => {
    expect(avisStatutClass("publie")).toBe("bg-green-500");
    expect(avisStatutClass("masque")).toBeNull();
    expect(avisStatutIsSecondary("masque")).toBe(true);
    expect(avisStatutClass("attente")).toBe("bg-orange-500");
    expect(avisStatutIsSecondary("publie")).toBe(false);
  });

  it("formatDate : date longue FR", () => {
    expect(formatDate(new Date("2026-01-13T00:00:00"))).toContain("2026");
  });
});
