import { describe, it, expect } from "vitest";
import { buildMentionsLegalesEmetteur } from "./pdf-generator";

describe("buildMentionsLegalesEmetteur — assurance décennale", () => {
  it("inclut 'en <zone>' quand la zone de garantie est renseignée", () => {
    const lines = buildMentionsLegalesEmetteur({
      assuranceDecennaleNom: "Allianz",
      assuranceDecennalePolice: "123456",
      assuranceDecennaleGarantie: "France métropolitaine",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Allianz");
    expect(lines[0]).toContain("Police n° 123456");
    expect(lines[0]).toContain("garantissant les travaux en France métropolitaine");
  });

  it("n'inclut pas de segment zone quand assuranceDecennaleGarantie est absent", () => {
    const lines = buildMentionsLegalesEmetteur({
      assuranceDecennaleNom: "AXA",
      assuranceDecennalePolice: "789",
      assuranceDecennaleGarantie: null,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("AXA");
    expect(lines[0]).not.toContain("garantissant");
  });

  it("n'émet aucune ligne quand nom ou police manquent", () => {
    expect(buildMentionsLegalesEmetteur({ assuranceDecennaleNom: "MAF", assuranceDecennalePolice: null })).toHaveLength(0);
    expect(buildMentionsLegalesEmetteur({ assuranceDecennaleNom: null, assuranceDecennalePolice: "999" })).toHaveLength(0);
    expect(buildMentionsLegalesEmetteur({})).toHaveLength(0);
  });
});
