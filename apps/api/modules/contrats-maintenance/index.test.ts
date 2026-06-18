import { describe, it, expect } from "vitest";
import * as contratsPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types/ports sont
// effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite.
describe("contrats-maintenance — barrel (contrat public)", () => {
  it("expose le factory createContratsMaintenanceModule", () => {
    expect(typeof contratsPublic.createContratsMaintenanceModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("ContratRepositoryDrizzle" in contratsPublic).toBe(false);
    expect("FakeContratRepository" in contratsPublic).toBe(false);
  });
});
