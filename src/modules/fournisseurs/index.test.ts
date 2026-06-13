import { describe, it, expect } from "vitest";
import * as fournisseursPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime).
describe("fournisseurs — barrel (contrat public)", () => {
  it("expose le factory createFournisseursModule", () => {
    expect(typeof fournisseursPublic.createFournisseursModule).toBe("function");
  });
});
