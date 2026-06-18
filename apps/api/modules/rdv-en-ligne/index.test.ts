import { describe, it, expect } from "vitest";
import * as rdvPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types/ports sont
// effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite.
describe("rdv-en-ligne — barrel (contrat public)", () => {
  it("expose le factory createRdvEnLigneModule", () => {
    expect(typeof rdvPublic.createRdvEnLigneModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("RdvRepositoryDrizzle" in rdvPublic).toBe(false);
    expect("FakeRdvRepository" in rdvPublic).toBe(false);
  });
});
