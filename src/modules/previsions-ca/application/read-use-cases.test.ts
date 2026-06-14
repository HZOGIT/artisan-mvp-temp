import { describe, it, expect } from "vitest";
import { FakePrevisionCARepository } from "../infra/prevision-ca-repository-fake";
import { listPrevisions, previsionsParAnnee, getPrevision, getPrevisions, getHistorique } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { HistoriqueCA } from "../domain/prevision-ca";

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
