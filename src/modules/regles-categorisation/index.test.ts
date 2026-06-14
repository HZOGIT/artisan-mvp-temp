import { describe, it, expect } from "vitest";
import * as reglesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types/ports sont
// effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite.
describe("regles-categorisation — barrel (contrat public)", () => {
  it("expose le factory createReglesCategorisationModule", () => {
    expect(typeof reglesPublic.createReglesCategorisationModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("RegleCategorisationRepositoryDrizzle" in reglesPublic).toBe(false);
    expect("FakeRegleCategorisationRepository" in reglesPublic).toBe(false);
  });
});
