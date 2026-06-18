import { describe, it, expect } from "vitest";
import * as congesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage + le calcul pur de solde sont
// exposés. Les types de domaine/ports sont effacés à la compilation ; on vérifie les valeurs
// runtime et surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite par le barrel public.
describe("conges — barrel (contrat public)", () => {
  it("expose le factory createCongesModule et le calcul pur calculerJoursConge", () => {
    expect(typeof congesPublic.createCongesModule).toBe("function");
    expect(typeof congesPublic.calculerJoursConge).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("CongeRepositoryDrizzle" in congesPublic).toBe(false);
    expect("FakeCongeRepository" in congesPublic).toBe(false);
  });
});
