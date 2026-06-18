import { describe, it, expect } from "vitest";
import * as clientsPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime) et
// surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite par le barrel public.
describe("clients — barrel (contrat public)", () => {
  it("expose le factory createClientsModule", () => {
    expect(typeof clientsPublic.createClientsModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("ClientRepositoryDrizzle" in clientsPublic).toBe(false);
    expect("FakeClientRepository" in clientsPublic).toBe(false);
  });
});
