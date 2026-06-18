import { describe, expect, it } from "vitest";
import { subDays } from "date-fns";
import { computeDevisStats, PERIODES, type Devis } from "./statistiques";

const NOW = new Date("2026-06-17T00:00:00Z");
const ago = (n: number) => subDays(NOW, n).toISOString();

const mk = (p: Partial<Devis>): Devis =>
  ({ statut: "brouillon", dateDevis: null, updatedAt: null, totalTTC: "0", ...p } as unknown as Devis);

describe("PERIODES", () => {
  it("liste les périodes", () => {
    expect(PERIODES).toEqual(["7", "30", "90", "365", "all"]);
  });
});

describe("computeDevisStats", () => {
  // Période courante (30j) : d1,d2,d3 ; période précédente (30j d'avant) : d4 (à now-60).
  const list = [
    mk({ statut: "accepte", dateDevis: ago(10), updatedAt: ago(5), totalTTC: "1000" }), // delai 5
    mk({ statut: "refuse", dateDevis: ago(3), updatedAt: ago(1), totalTTC: "500" }), // delai 2
    mk({ statut: "envoye", dateDevis: ago(2), totalTTC: "300" }),
    mk({ statut: "accepte", dateDevis: ago(60), totalTTC: "9999" }), // hors période courante
  ];

  it("agrège compteurs, montants, taux, délai moyen sur la période", () => {
    const s = computeDevisStats(list, "30", NOW);
    expect(s.total).toBe(3);
    expect(s.acceptes).toBe(1);
    expect(s.refuses).toBe(1);
    expect(s.envoyes).toBe(1);
    expect(s.tauxConversion).toBe(50); // 1 accepté / 2 traités
    expect(s.montantTotal).toBe(1800);
    expect(s.montantAccepte).toBe(1000);
    expect(s.montantEnAttente).toBe(300);
    expect(s.montantPerdu).toBe(500);
    expect(s.montantMoyen).toBe(600);
    expect(s.delaiMoyen).toBe(4); // round((5+2)/2)
    expect(s.avecReponseCount).toBe(2);
  });

  it("calcule l'évolution du taux vs période précédente", () => {
    const s = computeDevisStats(list, "30", NOW);
    // période précédente : d4 (accepté, traité) → taux 100% ; courant 50% → évolution -50
    expect(s.evolutionTaux).toBe(-50);
  });

  it("'all' = pas de filtre de période (4 devis, période précédente vide)", () => {
    const s = computeDevisStats(list, "all", NOW);
    expect(s.total).toBe(4);
    // pas de période précédente → prevTaux 0 → évolution = taux courant (2 acceptés / 3 traités)
    expect(s.evolutionTaux).toBeCloseTo(s.tauxConversion);
  });

  it("liste vide → zéros sans division par zéro", () => {
    const s = computeDevisStats([], "30", NOW);
    expect(s).toMatchObject({ total: 0, tauxConversion: 0, montantMoyen: 0, delaiMoyen: 0 });
  });
});
