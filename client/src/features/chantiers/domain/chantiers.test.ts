import { describe, expect, it } from "vitest";
import { statutVariant, prioriteColor, techNom, mainOeuvreSynthese, activitesForChantier, activitesParEcheance, rappelsActifs, suiviPourcentage, type Phase, type Pointage, type Activite, type Technicien } from "./chantiers";

describe("chantiers — domain pur", () => {
  it("statutVariant / prioriteColor", () => {
    expect(statutVariant("en_cours")).toBe("default");
    expect(statutVariant("annule")).toBe("destructive");
    expect(statutVariant("en_pause")).toBe("outline");
    expect(statutVariant("planifie")).toBe("secondary");
    expect(prioriteColor("urgente")).toContain("red");
    expect(prioriteColor("normale")).toContain("blue");
  });

  it("techNom : prénom + nom, # si introuvable, — si nul", () => {
    const techs = [{ id: 1, prenom: "Jean", nom: "Dupont" }] as unknown as Technicien[];
    expect(techNom(techs, 1)).toBe("Jean Dupont");
    expect(techNom(techs, 9)).toBe("#9");
    expect(techNom(techs, null)).toBe("—");
  });

  it("mainOeuvreSynthese : prévues vs pointées + écart", () => {
    const phases = [{ heuresPrevues: "10" }, { heuresPrevues: "5" }] as unknown as Phase[];
    const pointages = [{ heures: "8" }, { heures: "4" }] as unknown as Pointage[];
    expect(mainOeuvreSynthese(phases, pointages)).toEqual({ totalPrevues: 15, totalPointees: 12, ecart: -3 });
  });

  it("activitesForChantier / parEcheance / rappelsActifs", () => {
    const act = [
      { id: 1, entiteType: "chantier", entiteId: 7, echeance: "2026-03-02", fait: false },
      { id: 2, entiteType: "chantier", entiteId: 7, echeance: "2026-01-01", fait: true },
      { id: 3, entiteType: "client", entiteId: 7, echeance: "2026-02-01", fait: false },
    ] as unknown as Activite[];
    const forCh = activitesForChantier(act, 7);
    expect(forCh.map((a) => a.id)).toEqual([1, 2]);
    expect(activitesParEcheance(forCh).map((a) => a.id)).toEqual([2, 1]);
    expect(rappelsActifs(forCh)).toBe(1);
  });

  it("suiviPourcentage : 100/50/0", () => {
    expect(suiviPourcentage("termine")).toBe(100);
    expect(suiviPourcentage("en_cours")).toBe(50);
    expect(suiviPourcentage("a_faire")).toBe(0);
  });
});
