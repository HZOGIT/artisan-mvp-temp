import { describe, it, expect } from "vitest";
import * as badgesPublic from "./index";

// Vérifie le contrat public du module (barrel) : le point d'entrée d'assemblage est
// exposé. Les types de domaine/ports sont effacés à la compilation ; on s'assure que
// le factory du module (valeur runtime) est bien réexporté.
describe("badges — barrel (contrat public)", () => {
  it("expose le factory createBadgesModule", () => {
    expect(typeof badgesPublic.createBadgesModule).toBe("function");
  });
});
