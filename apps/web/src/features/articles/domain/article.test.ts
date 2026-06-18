import { describe, expect, it } from "vitest";
import {
  filterArticles,
  distinctCategories,
  distinctMetiers,
  computeMarge,
  parseImportCsv,
  type BiblioArticle,
} from "./article";

const mk = (p: Partial<BiblioArticle> & { id: number }): BiblioArticle =>
  ({ nom: "", description: "", sousCategorie: "", categorie: "", metier: "", unite: "", prixBase: "0", prixRevient: null, tauxTVA: "20", ...p } as unknown as BiblioArticle);

describe("filterArticles", () => {
  const list = [
    mk({ id: 1, nom: "Mitigeur", sousCategorie: "robinetterie", categorie: "fourniture", metier: "plombier" }),
    mk({ id: 2, nom: "Câble 3G", description: "souple", categorie: "fourniture", metier: "electricien" }),
    mk({ id: 3, nom: "Pose prise", categorie: "prestation", metier: "electricien" }),
  ];
  it("recherche nom / description / sous-catégorie", () => {
    expect(filterArticles(list, { searchQuery: "robinet", categoryFilter: "all", metierFilter: "all" }).map((a) => a.id)).toEqual([1]);
    expect(filterArticles(list, { searchQuery: "souple", categoryFilter: "all", metierFilter: "all" }).map((a) => a.id)).toEqual([2]);
  });
  it("filtre catégorie + métier", () => {
    expect(filterArticles(list, { searchQuery: "", categoryFilter: "prestation", metierFilter: "all" }).map((a) => a.id)).toEqual([3]);
    expect(filterArticles(list, { searchQuery: "", categoryFilter: "all", metierFilter: "electricien" }).map((a) => a.id)).toEqual([2, 3]);
  });
});

describe("distinctCategories / distinctMetiers", () => {
  it("dédoublonne et ignore les vides", () => {
    const list = [mk({ id: 1, categorie: "a", metier: "x" }), mk({ id: 2, categorie: "a", metier: "y" }), mk({ id: 3, categorie: "", metier: "x" })];
    expect(distinctCategories(list)).toEqual(["a"]);
    expect(distinctMetiers(list).sort()).toEqual(["x", "y"]);
  });
});

describe("computeMarge", () => {
  it("calcule montant / pct / signe", () => {
    expect(computeMarge("100", "60")).toEqual({ montant: 40, pct: 40, positive: true });
    expect(computeMarge("100", "120")).toEqual({ montant: -20, pct: -20, positive: false });
  });
  it("null si prix de vente <= 0 ou valeurs invalides", () => {
    expect(computeMarge("0", "10")).toBeNull();
    expect(computeMarge("", "10")).toBeNull();
    expect(computeMarge("100", "")).toBeNull();
    expect(computeMarge("100", null)).toBeNull();
  });
});

describe("parseImportCsv", () => {
  it("renvoie [] si moins de 2 lignes", () => {
    expect(parseImportCsv("")).toEqual([]);
    expect(parseImportCsv("nom,prix")).toEqual([]);
  });

  it("mappe les colonnes par mots-clés d'en-tête + valeurs par défaut", () => {
    const csv = [
      "Nom,Description,Unité,Prix HT,Catégorie,Sous-catégorie,Métier",
      '"Mitigeur","robinet","u","45,50","fourniture","robinetterie","plombier"',
      '"Pose",,,"30",,,',
    ].join("\n");
    const rows = parseImportCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      nom: "Mitigeur",
      description: "robinet",
      unite: "u",
      prix_base: "45.50", // virgule -> point
      categorie: "fourniture",
      sous_categorie: "robinetterie",
      metier: "plombier",
    });
    // Défauts appliqués sur la 2e ligne (champs vides)
    expect(rows[1]).toMatchObject({ nom: "Pose", unite: "unité", prix_base: "30", categorie: "fourniture", metier: "plombier" });
  });

  it("ignore les lignes sans nom", () => {
    const csv = ["nom,prix", '"",10', '"Vrai",20'].join("\n");
    expect(parseImportCsv(csv).map((r) => r.nom)).toEqual(["Vrai"]);
  });
});
