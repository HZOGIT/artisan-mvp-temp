import { describe, it, expect } from "vitest";
import * as techniciensPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime).
describe("techniciens — barrel (contrat public)", () => {
  it("expose le factory createTechniciensModule", () => {
    expect(typeof techniciensPublic.createTechniciensModule).toBe("function");
  });
});
