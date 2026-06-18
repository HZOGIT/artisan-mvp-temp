import { describe, it, expect } from "vitest";
import { computeTresorerie, getTresoreriePrevisionnelle } from "./tresorerie-use-case";
import type { TresorerieReader } from "./tresorerie-reader";
import type { TresorerieData } from "../domain/prevision-ca";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
// Lundi 2026-01-05 00:00 (référence stable pour les buckets hebdo).
const NOW = new Date("2026-01-05T09:00:00Z");
const empty: TresorerieData = { creances: [], avoirsTotalTTC: [], depensesRecurrentes: [] };

describe("previsions — computeTresorerie (pur)", () => {
  it("encaissements bucketés par date d'échéance (reste dû) ; cumulatif", () => {
    const data: TresorerieData = {
      creances: [
        { dateEcheance: "2026-01-06", totalTTC: "1000.00", montantPaye: "200.00" }, // reste 800 → semaine 0
        { dateEcheance: "2026-01-15", totalTTC: "500.00", montantPaye: "0.00" }, // → semaine 1
        { dateEcheance: "2026-01-10", totalTTC: "300.00", montantPaye: "300.00" }, // soldée → ignorée
      ],
      avoirsTotalTTC: [],
      depensesRecurrentes: [],
    };
    const t = computeTresorerie(data, 4, NOW);
    expect(t.semaines[0].entrees).toBe(800);
    expect(t.semaines[1].entrees).toBe(500);
    expect(t.totalEntrees).toBe(1300);
    expect(t.totalSorties).toBe(0);
    expect(t.totalNet).toBe(1300);
    // cumulatif
    expect(t.semaines[0].cumulatif).toBe(800);
    expect(t.semaines[1].cumulatif).toBe(1300);
  });

  it("échéance passée → semaine 0 ; hors fenêtre → ignorée", () => {
    const data: TresorerieData = {
      creances: [
        { dateEcheance: "2025-12-01", totalTTC: "400.00", montantPaye: "0.00" }, // passé → semaine 0
        { dateEcheance: "2026-06-01", totalTTC: "999.00", montantPaye: "0.00" }, // hors fenêtre (4 sem) → ignorée
      ],
      avoirsTotalTTC: [],
      depensesRecurrentes: [],
    };
    const t = computeTresorerie(data, 4, NOW);
    expect(t.semaines[0].entrees).toBe(400);
    expect(t.totalEntrees).toBe(400);
  });

  it("avoirs nettent les entrées les plus proches, planché à 0", () => {
    const data: TresorerieData = {
      creances: [
        { dateEcheance: "2026-01-06", totalTTC: "500.00", montantPaye: "0.00" }, // sem 0
        { dateEcheance: "2026-01-15", totalTTC: "500.00", montantPaye: "0.00" }, // sem 1
      ],
      avoirsTotalTTC: ["-700.00"], // crédit 700 → 500 sur sem0 (→0) + 200 sur sem1 (→300)
      depensesRecurrentes: [],
    };
    const t = computeTresorerie(data, 4, NOW);
    expect(t.semaines[0].entrees).toBe(0);
    expect(t.semaines[1].entrees).toBe(300);
    expect(t.totalEntrees).toBe(300);
  });

  it("dépenses récurrentes expansées (mensuelle) → décaissements ; net négatif", () => {
    const data: TresorerieData = {
      creances: [],
      avoirsTotalTTC: [],
      depensesRecurrentes: [{ montantTtc: "100.00", frequence: "mensuelle", prochaineOccurrence: "2026-01-06" }],
    };
    // fenêtre 8 semaines (~2 mois) → occurrences 2026-01-06 et 2026-02-06
    const t = computeTresorerie(data, 8, NOW);
    expect(t.semaines[0].sorties).toBe(100);
    expect(t.totalSorties).toBe(200); // 2 occurrences dans 8 semaines
    expect(t.totalNet).toBe(-200);
  });

  it("fréquence inconnue → une seule occurrence", () => {
    const data: TresorerieData = {
      creances: [],
      avoirsTotalTTC: [],
      depensesRecurrentes: [{ montantTtc: "100.00", frequence: null, prochaineOccurrence: "2026-01-06" }],
    };
    const t = computeTresorerie(data, 8, NOW);
    expect(t.totalSorties).toBe(100);
  });
});

describe("previsions — getTresoreriePrevisionnelle use-case", () => {
  it("sans reader → trésorerie vide", async () => {
    const t = await getTresoreriePrevisionnelle(undefined, A, 8, NOW);
    expect(t).toEqual({ semaines: [], totalEntrees: 0, totalSorties: 0, totalNet: 0 });
  });

  it("avec reader → délègue au calcul pur", async () => {
    const reader: TresorerieReader = { async load() { return { ...empty, creances: [{ dateEcheance: "2026-01-06", totalTTC: "300.00", montantPaye: "0.00" }] }; } };
    const t = await getTresoreriePrevisionnelle(reader, A, 4, NOW);
    expect(t.totalEntrees).toBe(300);
  });
});
