import { describe, it, expect } from "vitest";
import {
  buildSuggestRelancesPrompt,
  parseRelances,
  buildGenerateDevisPrompt,
  parseDevisLignes,
  buildAnalyseRentabilitePrompt,
  buildPredictionTresoreriePrompt,
  joursDepuis,
} from "./generators";

describe("assistant generators (domain)", () => {
  it("buildSuggestRelancesPrompt : liste + system JSON", () => {
    const p = buildSuggestRelancesPrompt([{ numero: "D1", objet: "Toit", totalTTC: "1000", jours: 14, client: "Jean" }]);
    expect(p.user).toContain("- Devis D1 (Toit) : 1000€ TTC, envoyé il y a 14 jours à Jean");
    expect(p.system).toContain('"email"');
    expect(p.temperature).toBe(0.7);
  });
  it("buildSuggestRelancesPrompt : objet null → 'sans objet'", () => {
    const p = buildSuggestRelancesPrompt([{ numero: "D1", objet: null, totalTTC: "100", jours: 8, client: "C" }]);
    expect(p.user).toContain("(sans objet)");
  });

  it("parseRelances : JSON valide → tableau ; invalide → [{error}]", () => {
    expect(parseRelances('[{"numero":"D1"}]')).toEqual([{ numero: "D1" }]);
    expect(parseRelances("rien")).toEqual([{ error: "rien" }]);
    expect(parseRelances("[cassé")).toEqual([{ error: "[cassé" }]);
  });

  it("buildGenerateDevisPrompt : catalogue injecté ; parseDevisLignes défensif", () => {
    const p = buildGenerateDevisPrompt("réfection", "Pose - 100€/u");
    expect(p.system).toContain("Pose - 100€/u");
    expect(p.user).toContain("réfection");
    expect(parseDevisLignes('[{"designation":"x"}]')).toHaveLength(1);
    expect(parseDevisLignes("pas de json")).toEqual([]);
  });

  it("buildAnalyseRentabilitePrompt : lignes détaillées + tarifs", () => {
    const p = buildAnalyseRentabilitePrompt({
      numero: "D5",
      totalHT: "1000",
      totalTTC: "1200",
      clientNom: "Jean",
      lignes: [{ designation: "Pose", quantite: "2", unite: "u", prixUnitaireHT: "100", tauxTVA: "20" }],
      tarifs: "Pose: 90€/u",
    });
    expect(p.user).toContain("Devis D5 pour Jean");
    expect(p.user).toContain("- Pose: 2 u x 100€ HT (TVA 20%)");
    expect(p.user).toContain("Pose: 90€/u");
  });

  it("buildAnalyseRentabilitePrompt : tarifs vides → 'Non disponibles'", () => {
    const p = buildAnalyseRentabilitePrompt({ numero: "D", totalHT: "0", totalTTC: "0", clientNom: "C", lignes: [], tarifs: "" });
    expect(p.user).toContain("Non disponibles");
  });

  it("buildPredictionTresoreriePrompt : sections + défauts 'Aucune/Aucun'", () => {
    const p = buildPredictionTresoreriePrompt({ facturesPayees: "", facturesImpayees: "FAC2", devisAcceptes: "" });
    expect(p.user).toContain("Factures payées récentes :\nAucune");
    expect(p.user).toContain("Factures impayées :\nFAC2");
    expect(p.user).toContain("Devis acceptés (à facturer) :\nAucun");
  });

  it("joursDepuis : différence en jours plancher", () => {
    expect(joursDepuis(new Date("2026-06-01T12:00:00Z"), new Date("2026-06-15T12:00:00Z"))).toBe(14);
  });
});
