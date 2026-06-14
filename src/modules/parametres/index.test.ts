import { describe, it, expect } from "vitest";
import * as parametresPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage et les helpers de domaine sont
// exposés. Les types/ports sont effacés à la compilation ; on vérifie surtout qu'aucune impl
// d'infra (Drizzle/fake) ne fuite.
describe("parametres — barrel (contrat public)", () => {
  it("expose le factory createParametresModule et le helper defaultParametres", () => {
    expect(typeof parametresPublic.createParametresModule).toBe("function");
    expect(typeof parametresPublic.defaultParametres).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("ParametresRepositoryDrizzle" in parametresPublic).toBe(false);
    expect("FakeParametresRepository" in parametresPublic).toBe(false);
  });
});
