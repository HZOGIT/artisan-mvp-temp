import { describe, expect, it } from "vitest";
import { typeBadgeColor, filterByType, renderPreview, EMAIL_TYPES, VARIABLES_DISPONIBLES, type Modele } from "./modeles-email";

const m = (id: number, type: string): Modele => ({ id, type, nom: `M${id}`, sujet: "s", contenu: "c" } as unknown as Modele);

describe("modeles-email — domain pur", () => {
  it("typeBadgeColor mappe le type sur une couleur, repli gris", () => {
    expect(typeBadgeColor("relance_devis")).toContain("orange");
    expect(typeBadgeColor("envoi_facture")).toContain("green");
    expect(typeBadgeColor("inconnu")).toContain("gray");
  });

  it("filterByType : 'all' = tous, sinon par type", () => {
    const list = [m(1, "relance_devis"), m(2, "autre"), m(3, "relance_devis")];
    expect(filterByType(list, "all")).toHaveLength(3);
    expect(filterByType(list, "relance_devis").map((x) => x.id)).toEqual([1, 3]);
  });

  it("renderPreview : substitue chaque {{variable}} (occurrences multiples)", () => {
    const out = renderPreview("Bonjour {{prenom_client}} {{nom_client}}, devis {{numero_devis}} et encore {{nom_client}}.");
    expect(out).toBe("Bonjour Jean Dupont, devis DEV-2025-001 et encore Dupont.");
  });

  it("renderPreview : variable inconnue laissée intacte", () => {
    expect(renderPreview("Solde {{inexistant}}")).toBe("Solde {{inexistant}}");
  });

  it("EMAIL_TYPES + VARIABLES_DISPONIBLES : parité legacy (5 types, 13 variables)", () => {
    expect(EMAIL_TYPES).toHaveLength(5);
    expect(VARIABLES_DISPONIBLES).toHaveLength(13);
  });
});
