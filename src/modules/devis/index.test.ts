import { describe, it, expect } from "vitest";
import * as devisPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime) et
// surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite par le barrel public.
describe("devis — barrel (contrat public)", () => {
  it("expose le factory createDevisModule", () => {
    expect(typeof devisPublic.createDevisModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("DevisRepositoryDrizzle" in devisPublic).toBe(false);
    expect("FakeDevisRepository" in devisPublic).toBe(false);
  });
});
