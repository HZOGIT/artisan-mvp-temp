import { describe, it, expect } from "vitest";
import { isValidIban, normalizeSlug } from "./iban";

describe("isValidIban", () => {
  it("vide/absent → valide (champ optionnel)", () => {
    expect(isValidIban("")).toBe(true);
    expect(isValidIban(null)).toBe(true);
    expect(isValidIban(undefined)).toBe(true);
    expect(isValidIban("   ")).toBe(true);
  });

  it("IBAN FR valide (clé MOD-97) ; espaces/casse tolérés", () => {
    expect(isValidIban("FR7630006000011234567890189")).toBe(true);
    expect(isValidIban("fr76 3000 6000 0112 3456 7890 189")).toBe(true);
  });

  it("clé de contrôle fausse / format invalide → false", () => {
    expect(isValidIban("FR7630006000011234567890188")).toBe(false); // clé fausse
    expect(isValidIban("XX12")).toBe(false); // trop court
    expect(isValidIban("1234567890")).toBe(false); // pas de code pays
  });
});

describe("normalizeSlug", () => {
  it("retire accents, met en minuscules, remplace séparateurs", () => {
    expect(normalizeSlug("Élec Pro 75")).toBe("elec-pro-75");
    expect(normalizeSlug("  Plomberie  &  Co  ")).toBe("plomberie-co");
  });
  it("chaîne sans alphanumérique → vide", () => {
    expect(normalizeSlug("@@@")).toBe("");
  });
});
