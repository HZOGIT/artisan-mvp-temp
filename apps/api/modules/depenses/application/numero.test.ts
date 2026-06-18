import { describe, it, expect } from "vitest";
import { computeNextNumero } from "./numero";

describe("depenses — computeNextNumero (pur)", () => {
  it("première dépense (aucune précédente) → DEP-00001", () => {
    expect(computeNextNumero("")).toBe("DEP-00001");
  });

  it("incrémente le suffixe numérique de la dernière", () => {
    expect(computeNextNumero("DEP-00001")).toBe("DEP-00002");
    expect(computeNextNumero("DEP-00041")).toBe("DEP-00042");
  });

  it("repart à 1 si le dernier numéro n'a pas de suffixe numérique", () => {
    expect(computeNextNumero("DEP-")).toBe("DEP-00001");
    expect(computeNextNumero("LIBRE")).toBe("DEP-00001");
  });

  it("dépasse 5 chiffres sans tronquer (padStart minimal)", () => {
    expect(computeNextNumero("DEP-99999")).toBe("DEP-100000");
  });
});
