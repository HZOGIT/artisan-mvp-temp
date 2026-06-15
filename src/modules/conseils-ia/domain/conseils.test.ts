import { describe, it, expect } from "vitest";
import { buildConseilsPrompt, parseConseils } from "./conseils";

describe("conseils domain", () => {
  it("buildConseilsPrompt : injecte stats + métier + demande du JSON", () => {
    const p = buildConseilsPrompt({
      nomEntreprise: "Plomberie X",
      metier: "plomberie",
      stats: { nbDevisEnAttente: 3, nbFacturesImpayees: 2, montantImpayees: 1500.4, nbStocksBas: 1 },
      moisLabel: "juin",
    });
    expect(p).toContain("Plomberie X");
    expect(p).toContain("3 devis en attente");
    expect(p).toContain("2 factures impayees (1500 EUR)"); // toFixed(0)
    expect(p).toContain("1 articles en stock bas");
    expect(p).toContain("juin");
    expect(p).toContain('"conseils"');
  });

  it("parseConseils : extrait le JSON, borne à 3, coerce les champs", () => {
    const txt = 'Voici : {"conseils":[{"icone":"💡","titre":"A","message":"m","actionLabel":"go","actionLien":"/devis"},{"titre":"B","actionLien":"/factures"},{"titre":"C","actionLien":"/stocks"},{"titre":"D"}]}';
    const c = parseConseils(txt);
    expect(c).toHaveLength(3);
    expect(c[0]).toEqual({ icone: "💡", titre: "A", message: "m", actionLabel: "go", actionLien: "/devis" });
    expect(c[1].icone).toBe("💡"); // défaut
  });

  it("parseConseils : lien non autorisé → /devis (allowlist)", () => {
    const c = parseConseils('{"conseils":[{"titre":"X","actionLien":"https://evil.com"}]}');
    expect(c[0].actionLien).toBe("/devis");
  });

  it("parseConseils : pas de JSON → []", () => {
    expect(parseConseils("aucun json")).toEqual([]);
    expect(parseConseils('{"conseils":"pas un tableau"}')).toEqual([]);
    expect(parseConseils("{json invalide}")).toEqual([]);
  });
});
