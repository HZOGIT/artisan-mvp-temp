import { describe, it, expect } from "vitest";
import * as ecrituresPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types/ports sont
// effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra (Drizzle/fake/adapter) ne
// fuite par le barrel public.
describe("ecritures — barrel (contrat public)", () => {
  it("expose le factory createEcrituresModule", () => {
    expect(typeof ecrituresPublic.createEcrituresModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake/adapter) depuis le contrat public", () => {
    expect("EcritureRepositoryDrizzle" in ecrituresPublic).toBe(false);
    expect("FakeEcritureRepository" in ecrituresPublic).toBe(false);
    expect("FactureReaderDrizzle" in ecrituresPublic).toBe(false);
    expect("ComptaEcrituresAdapter" in ecrituresPublic).toBe(false);
  });
});
