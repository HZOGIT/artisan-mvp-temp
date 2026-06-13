import { describe, it, expect } from "vitest";
import * as chantiersPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime) et
// surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite par le barrel public.
describe("chantiers — barrel (contrat public)", () => {
  it("expose le factory createChantiersModule", () => {
    expect(typeof chantiersPublic.createChantiersModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("ChantierRepositoryDrizzle" in chantiersPublic).toBe(false);
    expect("FakeChantierRepository" in chantiersPublic).toBe(false);
  });
});
