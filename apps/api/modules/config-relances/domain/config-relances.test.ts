import { describe, it, expect } from "vitest";
import { defaultConfigRelances } from "./config-relances";

// Valeurs par défaut du singleton « relances auto » (renvoyées quand aucune ligne tenant n'existe).
// Doivent rester alignées sur les DEFAULT de la table config_relances_auto.
describe("defaultConfigRelances", () => {
  it("reprend l'artisanId fourni", () => {
    expect(defaultConfigRelances(42).artisanId).toBe(42);
  });

  it("relances INACTIVES par défaut (opt-in)", () => {
    expect(defaultConfigRelances(1).actif).toBe(false);
  });

  it("cadence + bornes par défaut (7j / 7j / 3 relances max)", () => {
    const c = defaultConfigRelances(1);
    expect(c.joursApresEnvoi).toBe(7);
    expect(c.joursEntreRelances).toBe(7);
    expect(c.nombreMaxRelances).toBe(3);
  });

  it("fenêtre d'envoi par défaut : 09:00, jours ouvrés (1..5)", () => {
    const c = defaultConfigRelances(1);
    expect(c.heureEnvoi).toBe("09:00");
    expect(c.joursEnvoi).toBe("1,2,3,4,5");
    expect(c.modeleEmailId).toBeNull();
  });

  it("seul l'artisanId varie entre deux tenants (mêmes défauts)", () => {
    expect(defaultConfigRelances(7)).toEqual({ ...defaultConfigRelances(9), artisanId: 7 });
  });
});
