import { describe, it, expect } from "vitest";
import * as notesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime) et
// surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite par le barrel public.
describe("notes-de-frais — barrel (contrat public)", () => {
  it("expose le factory createNotesDeFraisModule", () => {
    expect(typeof notesPublic.createNotesDeFraisModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("NoteDeFraisRepositoryDrizzle" in notesPublic).toBe(false);
    expect("FakeNoteDeFraisRepository" in notesPublic).toBe(false);
  });
});
