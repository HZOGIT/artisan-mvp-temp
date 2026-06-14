import { describe, it, expect } from "vitest";
import * as configRelancesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage et le helper de défauts sont exposés.
// Les types/ports sont effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra
// (Drizzle/fake) ne fuite.
describe("config-relances — barrel (contrat public)", () => {
  it("expose le factory createConfigRelancesModule et le helper defaultConfigRelances", () => {
    expect(typeof configRelancesPublic.createConfigRelancesModule).toBe("function");
    expect(typeof configRelancesPublic.defaultConfigRelances).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("ConfigRelancesRepositoryDrizzle" in configRelancesPublic).toBe(false);
    expect("FakeConfigRelancesRepository" in configRelancesPublic).toBe(false);
  });
});
