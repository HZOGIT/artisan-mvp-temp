import { describe, it, expect } from "vitest";
import * as relancesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage et les tuples enum sont exposés. Les
// types/ports sont effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra (Drizzle/
// fake) ne fuite.
describe("relances-devis — barrel (contrat public)", () => {
  it("expose le factory createRelancesDevisModule + les tuples TYPES_RELANCE/STATUTS_RELANCE", () => {
    expect(typeof relancesPublic.createRelancesDevisModule).toBe("function");
    expect(relancesPublic.TYPES_RELANCE).toEqual(["email", "notification"]);
    expect(relancesPublic.STATUTS_RELANCE).toEqual(["envoye", "echec"]);
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("RelanceDevisRepositoryDrizzle" in relancesPublic).toBe(false);
    expect("FakeRelanceDevisRepository" in relancesPublic).toBe(false);
  });
});
