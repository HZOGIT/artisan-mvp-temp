import { describe, expect, it } from "vitest";
import {
  formatCurrency, partitionByEmail, defaultRelanceMessage, toggleJourEnvoi, JOURS_SEMAINE,
  type DevisNonSigne,
} from "./relance-devis";

const item = (id: number, email: string | null): DevisNonSigne =>
  ({ devis: { id, numero: `DV-${id}`, dateDevis: new Date(), totalTTC: "100.00", statut: "envoye" }, client: { id, nom: "Client", email }, signature: null, joursDepuisCreation: 10, joursDepuisEnvoi: null } as unknown as DevisNonSigne);

describe("formatCurrency", () => {
  it("formate string / number / null (null traité comme 0)", () => {
    expect(formatCurrency("100.5")).toContain("100,50");
    expect(formatCurrency("100.5")).toContain("€");
    expect(formatCurrency(0)).toContain("0,00");
    expect(formatCurrency(null)).toBe(formatCurrency(0));
  });
});

describe("partitionByEmail", () => {
  it("sépare avec/sans email", () => {
    const list = [item(1, "a@b.c"), item(2, null), item(3, "d@e.f")];
    const { avecEmail, sansEmail } = partitionByEmail(list);
    expect(avecEmail.map((d) => d.devis.id)).toEqual([1, 3]);
    expect(sansEmail.map((d) => d.devis.id)).toEqual([2]);
  });
});

describe("defaultRelanceMessage", () => {
  it("inclut le numéro et le montant", () => {
    const msg = defaultRelanceMessage("DV-42", "1 200,00 €");
    expect(msg).toContain("DV-42");
    expect(msg).toContain("1 200,00 €");
    expect(msg.startsWith("Bonjour,")).toBe(true);
  });
});

describe("toggleJourEnvoi", () => {
  it("ajoute un jour en gardant l'ordre trié", () => {
    expect(toggleJourEnvoi("1,2,3", "5")).toBe("1,2,3,5");
    expect(toggleJourEnvoi("2,3", "1")).toBe("1,2,3");
  });
  it("retire un jour présent", () => {
    expect(toggleJourEnvoi("1,2,3", "2")).toBe("1,3");
  });
  it("vide → un seul jour", () => {
    expect(toggleJourEnvoi("", "4")).toBe("4");
  });
  it("expose 7 libellés de jours", () => {
    expect(JOURS_SEMAINE).toHaveLength(7);
  });
});
