import { describe, it, expect } from "vitest";
import * as commandesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime).
describe("commandes — barrel (contrat public)", () => {
  it("expose le factory createCommandesModule", () => {
    expect(typeof commandesPublic.createCommandesModule).toBe("function");
  });
});
