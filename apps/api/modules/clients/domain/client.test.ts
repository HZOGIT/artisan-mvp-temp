import { describe, it, expect } from "vitest";
import { champsFusionnes, type Client } from "./client";

const base: Client = {
  id: 1,
  artisanId: 1,
  nom: "Martin",
  prenom: null,
  email: null,
  telephone: null,
  adresse: null,
  codePostal: null,
  ville: null,
  adresseFacturation: null,
  codePostalFacturation: null,
  villeFacturation: null,
  type: "particulier",
  raisonSociale: null,
  siret: null,
  numeroTVA: null,
  etiquettes: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("champsFusionnes (règle pure de complétion à la fusion)", () => {
  it("complète les champs VIDES du survivant à partir du doublon", () => {
    const survivant: Client = { ...base, id: 1, nom: "Martin" };
    const doublon: Client = { ...base, id: 2, email: "m@a.fr", telephone: "0600000000", ville: "Lyon" };
    const maj = champsFusionnes(survivant, doublon);
    expect(maj).toEqual({ email: "m@a.fr", telephone: "0600000000", ville: "Lyon" });
  });

  it("ne SURCHARGE jamais une donnée déjà saisie sur le survivant", () => {
    const survivant: Client = { ...base, id: 1, email: "garde@a.fr", ville: "Paris" };
    const doublon: Client = { ...base, id: 2, email: "autre@a.fr", ville: "Lyon", telephone: "0600000000" };
    const maj = champsFusionnes(survivant, doublon);
    expect(maj).toEqual({ telephone: "0600000000" });
  });

  it("survivant déjà complet → objet vide (update no-op, idempotent)", () => {
    const survivant: Client = { ...base, id: 1, email: "x@a.fr" };
    const doublon: Client = { ...base, id: 2, email: "x@a.fr" };
    expect(champsFusionnes(survivant, doublon)).toEqual({});
  });

  it("type : passe à professionnel si le doublon l'est et le survivant est resté particulier", () => {
    const survivant: Client = { ...base, id: 1, type: "particulier" };
    const doublon: Client = { ...base, id: 2, type: "professionnel" };
    expect(champsFusionnes(survivant, doublon).type).toBe("professionnel");
  });

  it("type : ne rétrograde pas un survivant professionnel", () => {
    const survivant: Client = { ...base, id: 1, type: "professionnel" };
    const doublon: Client = { ...base, id: 2, type: "particulier" };
    expect(champsFusionnes(survivant, doublon).type).toBeUndefined();
  });
});
