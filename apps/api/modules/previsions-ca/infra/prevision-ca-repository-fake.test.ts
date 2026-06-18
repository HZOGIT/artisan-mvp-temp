import { describe, it, expect } from "vitest";
import { FakePrevisionCARepository } from "./prevision-ca-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("FakePrevisionCARepository (CRUD catalogue, sans DB)", () => {
  it("create force artisanId + défauts montants '0.00' + confiance null", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await repo.create(A, { mois: 3, annee: 2026 });
    expect(p.artisanId).toBe(1);
    expect(p.caPrevisionnel).toBe("0.00");
    expect(p.caRealise).toBe("0.00");
    expect(p.ecart).toBe("0.00");
    expect(p.confiance).toBeNull();
    expect(p.methodeCalcul).toBe("moyenne_mobile");
  });

  it("getById / list / listByAnnee scopés au tenant (tri annee/mois desc)", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await repo.create(A, { mois: 1, annee: 2026, caPrevisionnel: "1000.00" });
    await repo.create(A, { mois: 5, annee: 2025 });
    expect((await repo.getById(A, p.id))?.caPrevisionnel).toBe("1000.00");
    expect((await repo.list(A)).map((x) => x.annee)).toEqual([2026, 2025]);
    expect((await repo.listByAnnee(A, 2026)).map((x) => x.mois)).toEqual([1]);
    expect(await repo.listByAnnee(A, 2099)).toEqual([]);
    expect(await repo.list(B)).toEqual([]);
  });

  it("ecart peut être négatif (caRealise < caPrevisionnel)", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await repo.create(A, { mois: 4, annee: 2026, caPrevisionnel: "1000.00", caRealise: "800.00", ecart: "-200.00", ecartPourcentage: "-20.00" });
    expect(p.ecart).toBe("-200.00");
    expect(p.ecartPourcentage).toBe("-20.00");
  });

  it("update ne modifie que montants/methode/confiance (mois/annee immuables) ; partiel préserve", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await repo.create(A, { mois: 6, annee: 2026, caPrevisionnel: "500.00" });
    const maj = await repo.update(A, p.id, { caRealise: "450.00", confiance: "80.00" });
    expect(maj?.caRealise).toBe("450.00");
    expect(maj?.confiance).toBe("80.00");
    expect(maj?.caPrevisionnel).toBe("500.00"); // préservé
    expect(maj?.mois).toBe(6); // immuable
    expect(maj?.annee).toBe(2026); // immuable
  });

  it("isolation cross-tenant : B → getById null, update/delete inopérants", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await repo.create(A, { mois: 7, annee: 2026 });
    expect(await repo.getById(B, p.id)).toBeNull();
    expect(await repo.update(B, p.id, { caRealise: "1.00" })).toBeNull();
    expect(await repo.delete(B, p.id)).toBe(false);
    expect(await repo.delete(A, p.id)).toBe(true);
  });
});
