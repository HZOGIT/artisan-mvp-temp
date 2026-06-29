import { describe, it, expect } from "vitest";
import { buildEpcPayload } from "./epc-qr";

describe("buildEpcPayload", () => {
  const base = {
    beneficiary: "Plomberie Martin",
    iban: "FR7630006000011234567890189",
    amountEur: 1234.56,
    reference: "FAC-2025-0042",
  };

  it("produit le payload EPC conforme (ordre, champs, format montant)", () => {
    const payload = buildEpcPayload(base);
    expect(payload).not.toBeNull();
    const lines = payload!.split("\n");
    expect(lines[0]).toBe("BCD");
    expect(lines[1]).toBe("002");
    expect(lines[2]).toBe("1");
    expect(lines[3]).toBe("SCT");
    expect(lines[4]).toBe("");
    expect(lines[5]).toBe("Plomberie Martin");
    expect(lines[6]).toBe("FR7630006000011234567890189");
    expect(lines[7]).toBe("EUR1234.56");
    expect(lines[8]).toBe("");
    expect(lines[9]).toBe("");
    expect(lines[10]).toBe("FAC-2025-0042");
    expect(lines).toHaveLength(11);
  });

  it("inclut le BIC quand fourni", () => {
    const payload = buildEpcPayload({ ...base, bic: "BNPAFRPP" });
    expect(payload!.split("\n")[4]).toBe("BNPAFRPP");
  });

  it("normalise l'IBAN (espaces, casse)", () => {
    const payload = buildEpcPayload({ ...base, iban: "fr76 3000 6000 0112 3456 7890 189" });
    expect(payload!.split("\n")[6]).toBe("FR7630006000011234567890189");
  });

  it("tronque le nom à 70 caractères", () => {
    const longName = "A".repeat(80);
    const payload = buildEpcPayload({ ...base, beneficiary: longName });
    expect(payload!.split("\n")[5]).toHaveLength(70);
  });

  it("retourne null si IBAN absent", () => {
    expect(buildEpcPayload({ ...base, iban: "" })).toBeNull();
  });

  it("retourne null si bénéficiaire absent", () => {
    expect(buildEpcPayload({ ...base, beneficiary: "" })).toBeNull();
  });
});
