import { describe, expect, it } from "vitest";
import { num, totalPrevisionnel, totalRealise, confianceMoyenne, ecartPct, confianceClass, MOIS_LABELS, METHODES, type Prevision } from "./previsions";

const p = (caPrev: string, caReal: string, conf: string): Prevision =>
  ({ id: 1, mois: 1, caPrevisionnel: caPrev, caRealise: caReal, confiance: conf } as unknown as Prevision);

describe("previsions — domain pur", () => {
  it("num : string/number/null → nombre, repli 0", () => {
    expect(num("1234.5")).toBe(1234.5);
    expect(num(10)).toBe(10);
    expect(num(null)).toBe(0);
    expect(num("x")).toBe(0);
  });

  it("totaux + confiance moyenne", () => {
    const list = [p("100", "80", "70"), p("200", "220", "50")];
    expect(totalPrevisionnel(list)).toBe(300);
    expect(totalRealise(list)).toBe(300);
    expect(confianceMoyenne(list)).toBe(60);
    expect(confianceMoyenne([])).toBe(0);
  });

  it("ecartPct : réalisé vs prévisionnel, 0 si prév nul", () => {
    expect(ecartPct(100, 120)).toBe(20);
    expect(ecartPct(0, 50)).toBe(0);
  });

  it("confianceClass : ≥70 vert, ≥50 jaune, sinon rouge", () => {
    expect(confianceClass(80)).toContain("green");
    expect(confianceClass(60)).toContain("yellow");
    expect(confianceClass(40)).toContain("red");
  });

  it("constantes de parité : 12 mois, 3 méthodes", () => {
    expect(MOIS_LABELS).toHaveLength(12);
    expect(METHODES).toEqual(["moyenne_mobile", "regression_lineaire", "saisonnalite"]);
  });
});
