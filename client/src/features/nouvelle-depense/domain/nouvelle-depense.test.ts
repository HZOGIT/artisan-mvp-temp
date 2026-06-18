import { describe, expect, it } from "vitest";
import { montants, prochaineOccurrence, applyOcr, buildPayload, defaultForm, type AnalyseData } from "./nouvelle-depense";

describe("nouvelle-depense — domain pur", () => {
  it("montants : TVA et TTC arrondis", () => {
    expect(montants("100", "20")).toEqual({ ht: 100, tva: 20, ttc: 120 });
    expect(montants("100", "5.5")).toEqual({ ht: 100, tva: 5.5, ttc: 105.5 });
    expect(montants("", "")).toEqual({ ht: 0, tva: 0, ttc: 0 });
  });

  it("prochaineOccurrence : +1 mois / +3 mois / +1 an, vide si non récurrente", () => {
    expect(prochaineOccurrence("2026-01-15", true, "mensuelle")).toBe("2026-02-15");
    expect(prochaineOccurrence("2026-01-15", true, "trimestrielle")).toBe("2026-04-15");
    expect(prochaineOccurrence("2026-01-15", true, "annuelle")).toBe("2027-01-15");
    expect(prochaineOccurrence("2026-01-15", false, "mensuelle")).toBe("");
  });

  it("applyOcr : remplit les champs détectés + marque les clés IA (tolère champs absents)", () => {
    const data = { fournisseur: "ACME", date: "2026-03-15", montantHT: 100, tauxTVA: 20, categorie: "materiaux" } as unknown as AnalyseData;
    const { form, iaFields } = applyOcr(defaultForm(), data);
    expect(form.fournisseur).toBe("ACME");
    expect(form.dateDepense).toBe("2026-03-15");
    expect(form.montantHt).toBe("100");
    expect(form.categorie).toBe("Matériaux & Fournitures");
    expect(iaFields).toEqual(new Set(["fournisseur", "dateDepense", "montantHt", "tauxTva", "categorie"]));
    expect(applyOcr(defaultForm(), {} as AnalyseData).iaFields.size).toBe(0);
  });

  it("buildPayload : montants en chaînes, pas de statut, récurrence conditionnelle", () => {
    const f = { ...defaultForm(), categorie: "Carburant", montantHt: "50", tauxTva: "20", recurrente: true, frequenceRecurrence: "mensuelle" as const, dateDepense: "2026-01-10" };
    const p = buildPayload(f, { photoDataUrl: "", photoNom: undefined });
    expect(p.montantHt).toBe("50");
    expect(p.tauxTva).toBe("20");
    expect(p.frequenceRecurrence).toBe("mensuelle");
    expect(p.prochaineOccurrence).toBe("2026-02-10");
    expect("statut" in p).toBe(false);
    const p2 = buildPayload({ ...f, recurrente: false }, { photoDataUrl: "", photoNom: undefined });
    expect(p2.frequenceRecurrence).toBeUndefined();
  });
});
