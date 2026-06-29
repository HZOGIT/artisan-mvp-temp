import { describe, it, expect } from "vitest";
import { assertDateNonVerrouillee } from "./compta-lock";

describe("assertDateNonVerrouillee", () => {
  it("passe si aucune date de verrouillage (null)", () => {
    expect(() => assertDateNonVerrouillee("2024-01-15", null)).not.toThrow();
  });

  it("refuse si date document ≤ date de verrouillage (même jour)", () => {
    expect(() => assertDateNonVerrouillee("2024-03-31", "2024-03-31")).toThrow(/verrouillée/);
  });

  it("refuse si date document < date de verrouillage (période close)", () => {
    expect(() => assertDateNonVerrouillee("2024-02-10", "2024-03-31")).toThrow(/verrouillée/);
  });

  it("passe si date document > date de verrouillage", () => {
    expect(() => assertDateNonVerrouillee("2024-04-01", "2024-03-31")).not.toThrow();
  });

  it("accepte un objet Date (dateFacture = now)", () => {
    const avantVerrou = new Date("2024-03-30T12:00:00Z");
    expect(() => assertDateNonVerrouillee(avantVerrou, "2024-03-31")).toThrow(/verrouillée/);
    const apresVerrou = new Date("2024-04-01T00:00:00Z");
    expect(() => assertDateNonVerrouillee(apresVerrou, "2024-03-31")).not.toThrow();
  });
});
