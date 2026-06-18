import { describe, it, expect } from "vitest";
import { calculerEncours, calculerEncoursParClient, type FactureEncoursLigne } from "./encours";

// `now` fixe pour des tests d'échéance déterministes.
const NOW = new Date("2026-06-13T12:00:00Z").getTime();
const PASSE = new Date("2026-05-01T00:00:00Z"); // échue
const FUTUR = new Date("2026-12-01T00:00:00Z"); // non échue

function ligne(p: Partial<FactureEncoursLigne>): FactureEncoursLigne {
  return {
    clientId: 1,
    statut: "envoyee",
    totalTTC: "100.00",
    montantPaye: "0.00",
    dateEcheance: FUTUR,
    typeDocument: "facture",
    ...p,
  };
}

describe("calculerEncours (parité legacy)", () => {
  it("facture envoyee non payée → reste dû compté", () => {
    const r = calculerEncours([ligne({ totalTTC: "120.00" })], NOW);
    expect(r.encoursTotal).toBe("120.00");
    expect(r.nbFacturesImpayees).toBe(1);
    expect(r.echu).toBe("0.00"); // échéance future
  });

  it("statuts non créance exclus (brouillon/validee/payee/annulee)", () => {
    for (const statut of ["brouillon", "validee", "payee", "annulee"]) {
      const r = calculerEncours([ligne({ statut })], NOW);
      expect(r.encoursTotal).toBe("0.00");
      expect(r.nbFacturesImpayees).toBe(0);
    }
  });

  it("paiement partiel → reste dû = totalTTC − montantPaye", () => {
    const r = calculerEncours([ligne({ totalTTC: "100.00", montantPaye: "30.00" })], NOW);
    expect(r.encoursTotal).toBe("70.00");
  });

  it("facture soldée (reste ≤ 0) ignorée", () => {
    const r = calculerEncours([ligne({ totalTTC: "100.00", montantPaye: "100.00" })], NOW);
    expect(r.encoursTotal).toBe("0.00");
    expect(r.nbFacturesImpayees).toBe(0);
  });

  it("part échue : dateEcheance passée OU statut en_retard", () => {
    const parDate = calculerEncours([ligne({ totalTTC: "50.00", dateEcheance: PASSE })], NOW);
    expect(parDate.echu).toBe("50.00");
    const parStatut = calculerEncours([ligne({ totalTTC: "50.00", statut: "en_retard", dateEcheance: FUTUR })], NOW);
    expect(parStatut.echu).toBe("50.00");
  });

  it("avoir validé réduit l'encours (crédit), planché à 0", () => {
    const rows = [
      ligne({ totalTTC: "100.00" }),
      ligne({ typeDocument: "avoir", totalTTC: "-30.00", statut: "envoyee" }),
    ];
    expect(calculerEncours(rows, NOW).encoursTotal).toBe("70.00");
    // avoir supérieur à l'encours → planché à 0 (jamais négatif)
    const rows2 = [
      ligne({ totalTTC: "20.00" }),
      ligne({ typeDocument: "avoir", totalTTC: "-50.00", statut: "envoyee" }),
    ];
    expect(calculerEncours(rows2, NOW).encoursTotal).toBe("0.00");
  });

  it("avoir annulé/brouillon ne réduit pas l'encours", () => {
    const rows = [
      ligne({ totalTTC: "100.00" }),
      ligne({ typeDocument: "avoir", totalTTC: "-30.00", statut: "annulee" }),
    ];
    expect(calculerEncours(rows, NOW).encoursTotal).toBe("100.00");
  });

  it("échu borné au net dû après déduction des avoirs", () => {
    const rows = [
      ligne({ totalTTC: "100.00", dateEcheance: PASSE }), // échue, 100
      ligne({ typeDocument: "avoir", totalTTC: "-60.00", statut: "envoyee" }),
    ];
    const r = calculerEncours(rows, NOW);
    expect(r.encoursTotal).toBe("40.00");
    expect(r.echu).toBe("40.00"); // borné au net (min(100, 40))
  });
});

describe("calculerEncoursParClient", () => {
  it("agrège par client et n'inclut que les débiteurs (total > 0)", () => {
    const rows: FactureEncoursLigne[] = [
      ligne({ clientId: 1, totalTTC: "100.00" }),
      ligne({ clientId: 1, totalTTC: "50.00", montantPaye: "20.00" }),
      ligne({ clientId: 2, totalTTC: "100.00", montantPaye: "100.00" }), // soldée → exclu
      ligne({ clientId: 3, statut: "payee", totalTTC: "999.00" }), // pas créance → exclu
    ];
    const map = calculerEncoursParClient(rows, NOW);
    expect(map[1].encoursTotal).toBe("130.00"); // 100 + 30
    expect(map[2]).toBeUndefined();
    expect(map[3]).toBeUndefined();
  });
});
