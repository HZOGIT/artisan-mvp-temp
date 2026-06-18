import { describe, it, expect } from "vitest";
import * as modelesEmailPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage et le tuple des types sont exposés.
// Les types/ports sont effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra
// (Drizzle/fake) ne fuite.
describe("modeles-email — barrel (contrat public)", () => {
  it("expose le factory createModelesEmailModule et le tuple TYPES_MODELE_EMAIL", () => {
    expect(typeof modelesEmailPublic.createModelesEmailModule).toBe("function");
    expect(modelesEmailPublic.TYPES_MODELE_EMAIL).toEqual(["relance_devis", "envoi_devis", "envoi_facture", "rappel_paiement", "autre"]);
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("ModeleEmailRepositoryDrizzle" in modelesEmailPublic).toBe(false);
    expect("FakeModeleEmailRepository" in modelesEmailPublic).toBe(false);
  });
});
