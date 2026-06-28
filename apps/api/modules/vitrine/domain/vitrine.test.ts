import { describe, it, expect } from "vitest";
import { computeAvisStats, resoudreServices, safeHtml, type AvisPublic } from "./vitrine";

const avis = (note: number): AvisPublic => ({ id: note, note, commentaire: null, reponseArtisan: null, reponseAt: null, createdAt: new Date(), clientNom: "X", verifie: false });

describe("computeAvisStats", () => {
  it("moyenne arrondie au dixième + distribution 1..5", () => {
    const s = computeAvisStats([avis(5), avis(4), avis(4)]);
    expect(s.total).toBe(3);
    expect(s.moyenne).toBe(4.3); // (13/3)=4.33 → 4.3
    expect(s.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 });
  });
  it("aucun avis → moyenne 0", () => {
    expect(computeAvisStats([])).toEqual({ moyenne: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  });
});

describe("resoudreServices", () => {
  it("JSON non vide prioritaire", () => {
    expect(resoudreServices('["Plomberie","Chauffage"]', ["Cat1"])).toEqual(["Plomberie", "Chauffage"]);
  });
  it("JSON vide/absent → repli sur les catégories", () => {
    expect(resoudreServices("[]", ["Cat1", "Cat2"])).toEqual(["Cat1", "Cat2"]);
    expect(resoudreServices(null, ["Cat1"])).toEqual(["Cat1"]);
  });
  it("JSON invalide → repli sur les catégories", () => {
    expect(resoudreServices("{not json", ["Cat1"])).toEqual(["Cat1"]);
  });
});

describe("safeHtml", () => {
  it("échappe < > & \" '", () => {
    expect(safeHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });
});
