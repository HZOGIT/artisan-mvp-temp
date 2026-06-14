import { describe, it, expect } from "vitest";
import { FakePrevisionCARepository } from "../infra/prevision-ca-repository-fake";
import { listPrevisions, previsionsParAnnee, getPrevision, getPrevisions, getHistorique, getComparaison, computeComparaison } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { HistoriqueCA, PrevisionCA } from "../domain/prevision-ca";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("previsions-ca — read use-cases", () => {
  it("listPrevisions renvoie les prévisions du tenant", async () => {
    const repo = new FakePrevisionCARepository();
    await repo.create(A, { mois: 3, annee: 2026 });
    expect(await listPrevisions(repo, A)).toHaveLength(1);
    expect(await listPrevisions(repo, B)).toEqual([]);
  });

  it("previsionsParAnnee filtre sur l'année ; [] si aucune", async () => {
    const repo = new FakePrevisionCARepository();
    await repo.create(A, { mois: 1, annee: 2026 });
    await repo.create(A, { mois: 2, annee: 2025 });
    expect((await previsionsParAnnee(repo, A, 2026)).map((p) => p.mois)).toEqual([1]);
    expect(await previsionsParAnnee(repo, A, 2099)).toEqual([]);
  });

  it("getPrevision → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await repo.create(A, { mois: 3, annee: 2026 });
    expect((await getPrevision(repo, A, p.id)).mois).toBe(3);
    await expect(getPrevision(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPrevision(repo, B, p.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getPrevisions : défaut = année courante ; annee explicite filtre", async () => {
    const repo = new FakePrevisionCARepository();
    const anneeCourante = new Date().getFullYear();
    await repo.create(A, { mois: 5, annee: anneeCourante });
    await repo.create(A, { mois: 6, annee: anneeCourante - 1 });
    // sans annee → année courante
    expect((await getPrevisions(repo, A)).map((p) => p.mois)).toEqual([5]);
    // annee explicite
    expect((await getPrevisions(repo, A, anneeCourante - 1)).map((p) => p.mois)).toEqual([6]);
  });

  it("computeComparaison (pur) : prévu vs réalisé, écart + % arrondis (parité legacy)", () => {
    const prev = (mois: number, caPrev: string): PrevisionCA => ({
      id: mois, artisanId: 1, mois, annee: 2026, caPrevisionnel: caPrev, caRealise: "0.00", ecart: "0.00", ecartPourcentage: "0.00", methodeCalcul: "moyenne_mobile", confiance: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const hist = (mois: number, caTotal: string): HistoriqueCA => ({
      id: mois, artisanId: 1, mois, annee: 2026, caTotal, nombreFactures: 1, nombreClients: 1, panierMoyen: "0.00", tauxConversion: null, createdAt: new Date(),
    });
    const res = computeComparaison([prev(1, "1000.00"), prev(2, "2000.00"), prev(3, "0.00")], [hist(1, "1200.00"), hist(3, "500.00")]);
    // mois 1 : réalisé 1200 vs prévu 1000 → écart +200, +20%
    expect(res[0]).toEqual({ mois: 1, caPrevisionnel: 1000, caRealise: 1200, ecart: 200, ecartPourcentage: 20 });
    // mois 2 : pas d'historique → réalisé 0, écart -2000, -100%
    expect(res[1]).toEqual({ mois: 2, caPrevisionnel: 2000, caRealise: 0, ecart: -2000, ecartPourcentage: -100 });
    // mois 3 : prévu 0 → ecartPourcentage 0 (pas de division par zéro)
    expect(res[2]).toEqual({ mois: 3, caPrevisionnel: 0, caRealise: 500, ecart: 500, ecartPourcentage: 0 });
  });

  it("getComparaison : compose previsions + historique de l'année, scopé tenant", async () => {
    const repo = new FakePrevisionCARepository();
    await repo.create(A, { mois: 1, annee: 2026, caPrevisionnel: "1000.00" });
    repo.seedHistorique({ id: 1, artisanId: 1, mois: 1, annee: 2026, caTotal: "1500.00", nombreFactures: 2, nombreClients: 1, panierMoyen: "750.00", tauxConversion: null, createdAt: new Date() });
    // autre tenant : ne doit pas polluer
    await repo.create(B, { mois: 1, annee: 2026, caPrevisionnel: "9999.00" });
    const res = await getComparaison(repo, A, 2026);
    expect(res).toEqual([{ mois: 1, caPrevisionnel: 1000, caRealise: 1500, ecart: 500, ecartPourcentage: 50 }]);
    // B voit sa propre prévision, sans historique → réalisé 0
    expect(await getComparaison(repo, B, 2026)).toEqual([{ mois: 1, caPrevisionnel: 9999, caRealise: 0, ecart: -9999, ecartPourcentage: -100 }]);
  });

  it("getHistorique : récent d'abord, borné à nombreMois, scopé tenant", async () => {
    const repo = new FakePrevisionCARepository();
    const h = (artisanId: number, mois: number, annee: number): HistoriqueCA => ({
      id: mois + annee, artisanId, mois, annee, caTotal: "1000.00", nombreFactures: 2, nombreClients: 1, panierMoyen: "500.00", tauxConversion: null, createdAt: new Date(),
    });
    repo.seedHistorique(h(1, 1, 2026));
    repo.seedHistorique(h(1, 12, 2025));
    repo.seedHistorique(h(1, 11, 2025));
    repo.seedHistorique(h(2, 1, 2026)); // autre tenant
    // récent d'abord (2026-01, 2025-12, 2025-11), borné à 2
    expect((await getHistorique(repo, A, 2)).map((x) => `${x.annee}-${x.mois}`)).toEqual(["2026-1", "2025-12"]);
    // isolation : B ne voit pas l'historique de A
    expect((await getHistorique(repo, B, 24)).map((x) => x.artisanId)).toEqual([2]);
  });
});
