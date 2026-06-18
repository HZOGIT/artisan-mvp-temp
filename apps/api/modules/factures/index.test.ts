import { describe, it, expect } from "vitest";
import * as facturesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage + le no-op compta (défaut neutre)
// sont exposés. Les types de domaine/ports sont effacés à la compilation ; on vérifie surtout
// qu'aucune impl d'infra (Drizzle/fake) ne fuite par le barrel public.
describe("factures — barrel (contrat public)", () => {
  it("expose le factory createFacturesModule et le no-op compta", () => {
    expect(typeof facturesPublic.createFacturesModule).toBe("function");
    expect(typeof facturesPublic.NoopComptaPort).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("FactureRepositoryDrizzle" in facturesPublic).toBe(false);
    expect("FakeFactureRepository" in facturesPublic).toBe(false);
    expect("DevisReaderDrizzle" in facturesPublic).toBe(false);
    expect("FakeDevisReader" in facturesPublic).toBe(false);
  });
});
