import { describe, it, expect } from "vitest";
import * as depensesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime) et
// surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite par le barrel public.
describe("depenses — barrel (contrat public)", () => {
  it("expose le factory createDepensesModule", () => {
    expect(typeof depensesPublic.createDepensesModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("DepenseRepositoryDrizzle" in depensesPublic).toBe(false);
    expect("FakeDepenseRepository" in depensesPublic).toBe(false);
  });
});
