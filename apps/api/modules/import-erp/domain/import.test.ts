import { describe, it, expect } from "vitest";
import { pickField, findClientByName, emptyResult, type ClientRef } from "./import";

describe("pickField", () => {
  const mapping = { "Nom complet": "nom", "Courriel": "email" };
  it("résout via le mapping, trim, undefined si absent/vide", () => {
    expect(pickField({ "Nom complet": "  Dupont  " }, mapping, "nom")).toBe("Dupont");
    expect(pickField({ "Courriel": "a@b.fr" }, mapping, "email")).toBe("a@b.fr");
    expect(pickField({ "Nom complet": "" }, mapping, "nom")).toBeUndefined();
    expect(pickField({}, mapping, "nom")).toBeUndefined();
    expect(pickField({ X: "1" }, mapping, "telephone")).toBeUndefined(); // champ non mappé
  });
  it("convertit en string (valeurs numériques)", () => {
    expect(pickField({ "Courriel": 42 }, mapping, "email")).toBe("42");
  });
});

describe("findClientByName", () => {
  const clients: ClientRef[] = [
    { id: 1, nom: "Dupont", prenom: "Jean", email: null },
    { id: 2, nom: "Martin", prenom: null, email: null },
  ];
  it("match prénom+nom, nom+prénom, nom seul, insensible casse/espaces", () => {
    expect(findClientByName(clients, "Jean Dupont")?.id).toBe(1);
    expect(findClientByName(clients, "  dupont jean ")?.id).toBe(1);
    expect(findClientByName(clients, "Dupont")?.id).toBe(1);
    expect(findClientByName(clients, "MARTIN")?.id).toBe(2);
    expect(findClientByName(clients, "Inconnu")).toBeUndefined();
  });
});

describe("emptyResult", () => {
  it("compteurs à zéro", () => {
    expect(emptyResult()).toEqual({ imported: 0, errors: 0, duplicates: 0, errorDetails: [] });
  });
});
