import { describe, expect, it } from "vitest";
import { isContactValid, SUJETS } from "./support";

describe("SUJETS", () => {
  it("liste les 4 sujets", () => {
    expect(SUJETS).toEqual(["technique", "facturation", "suggestion", "autre"]);
  });
});

describe("isContactValid", () => {
  it("requiert nom + email + message non vides", () => {
    expect(isContactValid({ nom: "Jean", email: "j@x.fr", message: "Bonjour" })).toBe(true);
  });
  it("invalide si un champ manque (ou n'est que des espaces)", () => {
    expect(isContactValid({ nom: "", email: "j@x.fr", message: "Bonjour" })).toBe(false);
    expect(isContactValid({ nom: "Jean", email: "  ", message: "Bonjour" })).toBe(false);
    expect(isContactValid({ nom: "Jean", email: "j@x.fr", message: "" })).toBe(false);
  });
});
