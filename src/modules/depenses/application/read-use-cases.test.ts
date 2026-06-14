import { describe, it, expect } from "vitest";
import { FakeDepenseRepository } from "../infra/depense-repository-fake";
import { listDepenses, getDepense, checkDoublons, getDepensesStats } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({
  userId: 100,
  numero: "DEP-1",
  dateDepense: "2026-06-15",
  categorie: "fournitures",
  montantHt: "100.00",
  montantTtc: "120.00",
  ...over,
});

describe("depenses — use-cases de lecture", () => {
  it("listDepenses ne renvoie que les dépenses du tenant", async () => {
    const repo = new FakeDepenseRepository();
    await repo.create(A, base({ description: "Chez A" }));
    await repo.create(B, base({ description: "Chez B" }));
    const list = await listDepenses(repo, A);
    expect(list.map((d) => d.description)).toEqual(["Chez A"]);
  });

  it("getDepense renvoie la dépense du tenant propriétaire", async () => {
    const repo = new FakeDepenseRepository();
    const d = await repo.create(A, base({ montantTtc: "42.00" }));
    expect((await getDepense(repo, A, d.id)).montantTtc).toBe("42.00");
  });

  it("getDepense sur une dépense d'un autre tenant → NotFound", async () => {
    const repo = new FakeDepenseRepository();
    const d = await repo.create(A, base({ description: "Secret" }));
    await expectCrossTenantDenied(() => getDepense(repo, B, d.id));
    await expect(getDepense(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getDepense sur un id inexistant → NotFound", async () => {
    const repo = new FakeDepenseRepository();
    await expect(getDepense(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("checkDoublons : match montant+date+fournisseur, scopé tenant, exclut excludeId", async () => {
    const repo = new FakeDepenseRepository();
    const d1 = await repo.create(A, base({ montantTtc: "120.00", dateDepense: "2026-06-15", fournisseur: "Leroy" }));
    await repo.create(A, base({ montantTtc: "120.00", dateDepense: "2026-06-15", fournisseur: "Autre" })); // fournisseur ≠
    await repo.create(B, base({ montantTtc: "120.00", dateDepense: "2026-06-15", fournisseur: "Leroy" })); // autre tenant
    const found = await checkDoublons(repo, A, { montantTtc: 120, dateDepense: "2026-06-15", fournisseur: "Leroy" });
    expect(found.map((d) => d.id)).toEqual([d1.id]);
    // excludeId retire le doublon courant
    expect(await checkDoublons(repo, A, { montantTtc: 120, dateDepense: "2026-06-15", fournisseur: "Leroy", excludeId: d1.id })).toEqual([]);
  });

  it("checkDoublons : montant ≤ 0 ou date invalide → [] (pas de détection)", async () => {
    const repo = new FakeDepenseRepository();
    await repo.create(A, base({ montantTtc: "120.00", dateDepense: "2026-06-15" }));
    expect(await checkDoublons(repo, A, { montantTtc: 0, dateDepense: "2026-06-15" })).toEqual([]);
    expect(await checkDoublons(repo, A, { montantTtc: 120, dateDepense: "pas-une-date" })).toEqual([]);
  });

  it("getDepensesStats : défaut = mois courant ; agrège le mois demandé", async () => {
    const repo = new FakeDepenseRepository();
    const moisCourant = new Date().toISOString().slice(0, 7);
    await repo.create(A, base({ montantTtc: "50.00", dateDepense: `${moisCourant}-10` }));
    await repo.create(A, base({ montantTtc: "30.00", dateDepense: `${moisCourant}-12` }));
    const stats = await getDepensesStats(repo, A);
    expect(stats.mois).toBe(moisCourant);
    expect(stats.totalMois).toBe(80);
    expect(stats.nbDepensesMois).toBe(2);
    // mois explicite sans dépense → 0
    expect((await getDepensesStats(repo, A, "2020-01")).totalMois).toBe(0);
  });
});
