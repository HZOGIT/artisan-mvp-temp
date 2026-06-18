import { describe, expect, it } from "vitest";
import { normalize, filterSections, DOC_SECTIONS, type DocSection } from "./documentation-content";

const sections: DocSection[] = [
  { id: "a", iconKey: "Users", title: "1. Clients", color: "", subsections: [
    { title: "Ajouter un client", content: ["Cliquez sur Nouveau client."] },
    { title: "Rechercher", content: ["barre de recherche instantanée"] },
  ] },
  { id: "b", iconKey: "FileText", title: "2. Devis", color: "", subsections: [
    { title: "Créer un devis", content: ["Bouton Nouveau devis"] },
  ] },
];

describe("documentation — domain pur", () => {
  it("normalize : accents + casse", () => {
    expect(normalize("  Éléctricité ")).toBe("electricite");
  });

  it("filterSections : requête vide → toutes les sections (copie)", () => {
    expect(filterSections(sections, "")).toHaveLength(2);
    expect(filterSections(sections, "   ")).toHaveLength(2);
  });

  it("filterSections : match sur titre de sous-section", () => {
    const r = filterSections(sections, "ajouter");
    expect(r).toHaveLength(1);
    expect(r[0].subsections).toHaveLength(1);
  });

  it("filterSections : match sur contenu, sections vides retirées", () => {
    const r = filterSections(sections, "devis");
    expect(r.map((s) => s.id)).toEqual(["b"]);
  });

  it("DOC_SECTIONS : catalogue non vide (parité legacy : 10 sections)", () => {
    expect(DOC_SECTIONS).toHaveLength(10);
  });
});
