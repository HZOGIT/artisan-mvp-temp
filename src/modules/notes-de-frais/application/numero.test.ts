import { describe, it, expect } from "vitest";
import { computeNextNoteFraisNumero } from "./numero";

// Numérotation PURE des notes de frais (parité legacy `getNextNoteFraisNumero`) : `NDF-<n>` sur
// 5 chiffres, n = suffixe de la dernière note + 1 (1 si aucune / format inattendu).
describe("computeNextNoteFraisNumero", () => {
  it("aucune note (chaîne vide) → NDF-00001", () => {
    expect(computeNextNoteFraisNumero("")).toBe("NDF-00001");
  });

  it("incrémente le suffixe numérique de la dernière note", () => {
    expect(computeNextNoteFraisNumero("NDF-00001")).toBe("NDF-00002");
    expect(computeNextNoteFraisNumero("NDF-00041")).toBe("NDF-00042");
  });

  it("format inattendu (pas de suffixe -\\d+) → repart à NDF-00001", () => {
    expect(computeNextNoteFraisNumero("BROUILLON")).toBe("NDF-00001");
    expect(computeNextNoteFraisNumero("NDF-")).toBe("NDF-00001");
  });

  it("ne se laisse pas piéger par des chiffres au milieu — seul le suffixe final compte", () => {
    // "2024" est au milieu ; le suffixe réel est 7 → 8.
    expect(computeNextNoteFraisNumero("NDF-2024-00007")).toBe("NDF-00008");
  });

  it("padding sur 5 chiffres min, mais déborde proprement au-delà de 99999", () => {
    expect(computeNextNoteFraisNumero("NDF-00099")).toBe("NDF-00100");
    expect(computeNextNoteFraisNumero("NDF-99999")).toBe("NDF-100000");
  });
});
