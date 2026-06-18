import { describe, expect, it } from "vitest";
import { statutVariant, equipeParIntervention, membreName, dureeSurSite, mapsUrl, type EquipeMembre } from "./interventions-mobile";

describe("interventions-mobile — domain pur", () => {
  it("statutVariant", () => {
    expect(statutVariant("en_cours")).toBe("default");
    expect(statutVariant("terminee")).toBe("outline");
    expect(statutVariant("annulee")).toBe("destructive");
    expect(statutVariant("planifiee")).toBe("secondary");
  });

  it("equipeParIntervention : indexe par interventionId", () => {
    const membres = [{ interventionId: 1, technicienId: 5 }, { interventionId: 1, technicienId: 6 }, { interventionId: 2, technicienId: 7 }] as unknown as EquipeMembre[];
    const map = equipeParIntervention(membres);
    expect(map.get(1)).toHaveLength(2);
    expect(map.get(2)).toHaveLength(1);
  });

  it("membreName : prénom+nom, repli Tech #id", () => {
    expect(membreName({ prenom: "Léa", nom: "M", technicienId: 5 } as unknown as EquipeMembre)).toBe("Léa M");
    expect(membreName({ prenom: null, nom: null, technicienId: 9 } as unknown as EquipeMembre)).toBe("Tech #9");
  });

  it("dureeSurSite : h+min ou min", () => {
    expect(dureeSurSite("2026-06-18T08:00:00Z", "2026-06-18T09:30:00Z")).toBe("1 h 30");
    expect(dureeSurSite("2026-06-18T08:00:00Z", "2026-06-18T08:45:00Z")).toBe("45 min");
    expect(dureeSurSite("2026-06-18T09:00:00Z", "2026-06-18T08:00:00Z")).toBe("0 min");
  });

  it("mapsUrl : adresse encodée", () => {
    expect(mapsUrl("15 rue de Paris")).toContain("15%20rue%20de%20Paris");
  });
});
