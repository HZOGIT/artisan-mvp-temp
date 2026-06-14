import { describe, it, expect } from "vitest";
import { FakePrevisionCARepository } from "../infra/prevision-ca-repository-fake";
import { calculerPrevisions, computePredictions } from "./calculer-use-case";
import { getHistorique, getPrevisions } from "./read-use-cases";
import type { FacturesCAReader } from "./factures-ca-reader";
import type { TenantContext } from "../../../shared/tenant";
import type { CAParMois, HistoriqueCA } from "../domain/prevision-ca";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

function fakeReader(byTenant: Record<number, CAParMois[]>): FacturesCAReader {
  return { async aggregatePaidByMonth(ctx) { return byTenant[ctx.artisanId] ?? []; } };
}

function hist(mois: number, annee: number, caTotal: string): HistoriqueCA {
  return { id: mois, artisanId: 1, mois, annee, caTotal, nombreFactures: 1, nombreClients: 1, panierMoyen: "0.00", tauxConversion: null, createdAt: new Date() };
}

describe("previsions — computePredictions (pur)", () => {
  it("moyenne_mobile : 12 mois à la moyenne globale ; confiance bornée", () => {
    const preds = computePredictions([hist(1, 2025, "1000.00"), hist(2, 2025, "3000.00")], "moyenne_mobile");
    expect(preds).toHaveLength(12);
    expect(preds.every((p) => p.caPrevisionnel === 2000)).toBe(true); // (1000+3000)/2
    expect(preds[0].confiance).toBe(36); // min(80, 30 + 2*3)
  });

  it("saisonnalite : reprend la moyenne du mois quand dispo, sinon moyenne globale", () => {
    const preds = computePredictions([hist(1, 2025, "1000.00"), hist(1, 2024, "2000.00"), hist(6, 2025, "600.00")], "saisonnalite");
    expect(preds[0].caPrevisionnel).toBe(1500); // moyenne du mois 1 = (1000+2000)/2
    expect(preds[5].caPrevisionnel).toBe(600); // mois 6
    // mois sans donnée → moyenne globale (1000+2000+600)/3 = 1200
    expect(preds[1].caPrevisionnel).toBe(1200);
  });

  it("regression_lineaire : tendance légèrement croissante sur l'année", () => {
    const preds = computePredictions([hist(1, 2025, "1200.00")], "regression_lineaire");
    expect(preds[0].caPrevisionnel).toBeCloseTo(1200 * (1 + 0.02 * (1 / 12)), 1);
    expect(preds[11].caPrevisionnel).toBeGreaterThan(preds[0].caPrevisionnel);
  });
});

describe("previsions — calculer use-case", () => {
  it("agrège factures payées → historique, puis projette → previsions (scopé tenant)", async () => {
    const repo = new FakePrevisionCARepository();
    const reader = fakeReader({
      1: [
        { mois: 1, annee: 2025, caTotal: "1000.00", nombreFactures: 2, nombreClients: 2 },
        { mois: 2, annee: 2025, caTotal: "3000.00", nombreFactures: 3, nombreClients: 1 },
      ],
    });
    const res = await calculerPrevisions({ repo, facturesReader: reader }, A, "moyenne_mobile");
    expect(res.methode).toBe("moyenne_mobile");
    expect(res.predictions).toHaveLength(12);
    // historique recalculé persisté (panierMoyen = caTotal/nbFactures)
    const h = await getHistorique(repo, A, 24);
    expect(h.find((x) => x.mois === 1)?.panierMoyen).toBe("500"); // 1000/2
    expect(h.find((x) => x.mois === 2)?.panierMoyen).toBe("1000"); // 3000/3
    // prévisions persistées pour l'année courante (moyenne globale = 2000)
    const annee = new Date().getFullYear();
    const prev = await getPrevisions(repo, A, annee);
    expect(prev).toHaveLength(12);
    expect(prev.every((p) => p.caPrevisionnel === "2000")).toBe(true);
    // isolation : B n'a pas d'historique ni de prévisions
    expect(await getHistorique(repo, B, 24)).toEqual([]);
  });

  it("aucune facture payée → message « pas assez de données » (rien persisté)", async () => {
    const repo = new FakePrevisionCARepository();
    const res = await calculerPrevisions({ repo, facturesReader: fakeReader({}) }, A, "moyenne_mobile");
    expect(res.message).toMatch(/pas assez/i);
    expect(res.predictions).toBeUndefined();
    expect(await getHistorique(repo, A, 24)).toEqual([]);
  });

  it("idempotent : recalculer remplace (upsert) sans doublonner l'historique", async () => {
    const repo = new FakePrevisionCARepository();
    const reader = fakeReader({ 1: [{ mois: 1, annee: 2025, caTotal: "1000.00", nombreFactures: 1, nombreClients: 1 }] });
    await calculerPrevisions({ repo, facturesReader: reader }, A, "moyenne_mobile");
    await calculerPrevisions({ repo, facturesReader: reader }, A, "moyenne_mobile");
    expect((await getHistorique(repo, A, 24)).filter((h) => h.mois === 1)).toHaveLength(1);
    const annee = new Date().getFullYear();
    expect((await getPrevisions(repo, A, annee)).filter((p) => p.mois === 1)).toHaveLength(1);
  });
});
