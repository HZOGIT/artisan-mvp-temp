import { describe, expect, it } from "vitest";
import {
  filterFournisseurs,
  filterArticles,
  fournisseurStats,
  indexArticlesById,
  type Fournisseur,
  type Article,
} from "./fournisseur";

const mkF = (p: Partial<Fournisseur> & { id: number }): Fournisseur =>
  ({ nom: "", contact: "", ville: "", email: "", telephone: "", ...p } as unknown as Fournisseur);
const mkA = (p: Partial<Article> & { id: number }): Article =>
  ({ designation: "", reference: "", ...p } as unknown as Article);

describe("filterFournisseurs", () => {
  const list = [
    mkF({ id: 1, nom: "Plomberie Durand", ville: "Lyon" }),
    mkF({ id: 2, nom: "Élec Pro", contact: "Marie", ville: "Paris" }),
    mkF({ id: 3, nom: "BoisCo" }),
  ];
  it("recherche nom / contact / ville", () => {
    expect(filterFournisseurs(list, "durand").map((f) => f.id)).toEqual([1]);
    expect(filterFournisseurs(list, "marie").map((f) => f.id)).toEqual([2]);
    expect(filterFournisseurs(list, "paris").map((f) => f.id)).toEqual([2]);
  });
  it("query vide → tout", () => {
    expect(filterFournisseurs(list, "")).toHaveLength(3);
  });
});

describe("filterArticles", () => {
  const list = [mkA({ id: 1, designation: "Tube cuivre", reference: "TC-12" }), mkA({ id: 2, designation: "Vis inox", reference: "VI-30" })];
  it("recherche désignation / référence", () => {
    expect(filterArticles(list, "cuivre").map((a) => a.id)).toEqual([1]);
    expect(filterArticles(list, "VI-30").map((a) => a.id)).toEqual([2]);
  });
});

describe("fournisseurStats", () => {
  it("compte total / avec email / avec téléphone", () => {
    const list = [
      mkF({ id: 1, email: "a@x.fr", telephone: "0102" }),
      mkF({ id: 2, email: "", telephone: "0304" }),
      mkF({ id: 3, email: "c@x.fr", telephone: "" }),
    ];
    expect(fournisseurStats(list)).toEqual({ total: 3, withEmail: 2, withPhone: 2 });
  });
  it("liste vide", () => {
    expect(fournisseurStats([])).toEqual({ total: 0, withEmail: 0, withPhone: 0 });
  });
});

describe("indexArticlesById", () => {
  it("indexe par id", () => {
    const map = indexArticlesById([mkA({ id: 7, designation: "X" }), mkA({ id: 9, designation: "Y" })]);
    expect(map.get(7)?.designation).toBe("X");
    expect(map.get(123)).toBeUndefined();
  });
});
