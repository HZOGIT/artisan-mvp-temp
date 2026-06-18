import { describe, it, expect } from "vitest";
import * as interventionsPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime) et
// surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite par le barrel public.
describe("interventions — barrel (contrat public)", () => {
  it("expose le factory createInterventionsModule", () => {
    expect(typeof interventionsPublic.createInterventionsModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("InterventionRepositoryDrizzle" in interventionsPublic).toBe(false);
    expect("FakeInterventionRepository" in interventionsPublic).toBe(false);
  });
});
