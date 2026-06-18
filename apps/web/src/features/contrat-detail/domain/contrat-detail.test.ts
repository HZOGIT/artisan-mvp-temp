import { describe, expect, it } from "vitest";
import { statutContratVariant, montantsContrat, defaultInterventionForm, buildCreateInterventionPayload, STATUT_INTERVENTION } from "./contrat-detail";

describe("contrat-detail — domain pur", () => {
  it("statutContratVariant", () => {
    expect(statutContratVariant("actif")).toBe("default");
    expect(statutContratVariant("suspendu")).toBe("secondary");
    expect(statutContratVariant("annule")).toBe("destructive");
    expect(statutContratVariant("termine")).toBe("outline");
  });

  it("montantsContrat : HT/TVA/TTC (défauts 0 et 20%)", () => {
    expect(montantsContrat("100", "20")).toEqual({ ht: 100, taux: 20, tva: 20, ttc: 120 });
    expect(montantsContrat(null, null)).toEqual({ ht: 0, taux: 20, tva: 0, ttc: 0 });
  });

  it("defaultInterventionForm : date = aujourd'hui (ISO yyyy-mm-dd)", () => {
    expect(defaultInterventionForm().dateIntervention).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(defaultInterventionForm().titre).toBe("");
  });

  it("buildCreateInterventionPayload : champs vides → undefined", () => {
    const payload = buildCreateInterventionPayload(7, { titre: "T", description: "", dateIntervention: "2026-06-18", duree: "", technicienNom: "Léa", notes: "" });
    expect(payload).toEqual({ contratId: 7, titre: "T", dateIntervention: "2026-06-18", description: undefined, duree: undefined, technicienNom: "Léa", notes: undefined });
  });

  it("STATUT_INTERVENTION : 4 statuts avec labelKey + color", () => {
    expect(Object.keys(STATUT_INTERVENTION)).toEqual(["planifiee", "en_cours", "effectuee", "annulee"]);
    expect(STATUT_INTERVENTION.effectuee.labelKey).toBe("interEffectuee");
  });
});
