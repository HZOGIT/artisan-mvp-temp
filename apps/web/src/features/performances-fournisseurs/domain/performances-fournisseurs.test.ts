import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, statutClass, statutVariant, fiabiliteColor, fiabiliteLevel, globalStats, STATUTS_COMMANDE, type Performance } from "./performances-fournisseurs";

const perf = (cmd: number, livrees: number, retard: number, montant: number, taux: number): Performance =>
  ({ fournisseur: { id: 1 }, totalCommandes: cmd, commandesLivrees: livrees, commandesEnRetard: retard, montantTotal: montant, tauxFiabilite: taux } as unknown as Performance);

describe("performances-fournisseurs — domain pur", () => {
  it("formatCurrency / formatDate", () => {
    expect(formatCurrency(1500)).toContain("€");
    expect(formatDate(null)).toBe("-");
    expect(formatDate(new Date("2026-01-13"))).toContain("2026");
  });

  it("statutClass / statutVariant : couleur ou variante selon statut", () => {
    expect(statutClass("livree")).toContain("green");
    expect(statutClass("en_attente")).toBeNull();
    expect(statutVariant("annulee")).toBe("destructive");
    expect(statutVariant("en_attente")).toBe("outline");
    expect(statutVariant("livree")).toBeUndefined();
  });

  it("fiabiliteColor / fiabiliteLevel : seuils 90/70", () => {
    expect(fiabiliteColor(95)).toContain("green");
    expect(fiabiliteColor(75)).toContain("yellow");
    expect(fiabiliteColor(50)).toContain("red");
    expect(fiabiliteLevel(95)).toBe("up");
    expect(fiabiliteLevel(75)).toBe("warn");
    expect(fiabiliteLevel(50)).toBe("down");
  });

  it("globalStats : agrège totaux + taux fiabilité global", () => {
    const s = globalStats([perf(10, 8, 2, 1000, 80), perf(5, 5, 0, 500, 100)]);
    expect(s).toMatchObject({ totalCommandes: 15, totalLivrees: 13, totalEnRetard: 2, montantTotalGlobal: 1500 });
    expect(s.tauxFiabiliteGlobal).toBe(Math.round(((13 - 2) / 15) * 100)); // 73
    expect(globalStats([]).tauxFiabiliteGlobal).toBe(100);
  });

  it("STATUTS_COMMANDE : 5 statuts de parité", () => {
    expect(STATUTS_COMMANDE).toEqual(["en_attente", "confirmee", "expediee", "livree", "annulee"]);
  });
});
