import { describe, it, expect } from "vitest";
import * as previsionsPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types/ports sont
// effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite.
describe("previsions-ca — barrel (contrat public)", () => {
  it("expose le factory createPrevisionsCAModule", () => {
    expect(typeof previsionsPublic.createPrevisionsCAModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("PrevisionCARepositoryDrizzle" in previsionsPublic).toBe(false);
    expect("FakePrevisionCARepository" in previsionsPublic).toBe(false);
  });
});
