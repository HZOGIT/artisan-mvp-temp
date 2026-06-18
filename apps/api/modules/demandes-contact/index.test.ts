import { describe, it, expect } from "vitest";
import * as demandesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types/ports sont
// effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite.
describe("demandes-contact — barrel (contrat public)", () => {
  it("expose le factory createDemandesContactModule", () => {
    expect(typeof demandesPublic.createDemandesContactModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("DemandeContactRepositoryDrizzle" in demandesPublic).toBe(false);
    expect("FakeDemandeContactRepository" in demandesPublic).toBe(false);
  });
});
