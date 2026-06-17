import { describe, expect, it } from "vitest";
import { formatCurrency, totalArticles, totalMontant, type RapportCommande } from "./rapport-commande";

const cmd = (lignes: number, total: number) => ({ lignes: Array.from({ length: lignes }), totalCommande: total });
const rapport = [cmd(2, 100), cmd(3, 250)] as unknown as RapportCommande;

describe("rapport-commande — domain pur", () => {
  it("formatCurrency : euros FR", () => {
    expect(formatCurrency(1234.5)).toContain("1");
    expect(formatCurrency(1234.5)).toContain("€");
  });
  it("totalArticles : somme des lignes", () => {
    expect(totalArticles(rapport)).toBe(5);
    expect(totalArticles([] as unknown as RapportCommande)).toBe(0);
  });
  it("totalMontant : somme des totaux", () => {
    expect(totalMontant(rapport)).toBe(350);
  });
});
