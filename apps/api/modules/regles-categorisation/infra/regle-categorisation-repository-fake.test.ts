import { describe, it, expect } from "vitest";
import { FakeRegleCategorisationRepository } from "./regle-categorisation-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("FakeRegleCategorisationRepository (CRUD catalogue, sans DB)", () => {
  it("create force artisanId + défaut actif true", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await repo.create(A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    expect(r.artisanId).toBe(1);
    expect(r.actif).toBe(true);
    expect(r.motifLibelle).toBe("ESSENCE");
  });

  it("getById / list scopés au tenant (tri par id)", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await repo.create(A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    await repo.create(A, { motifLibelle: "EDF", categorie: "energie", actif: false });
    expect((await repo.getById(A, r.id))?.categorie).toBe("carburant");
    expect((await repo.list(A)).map((x) => x.motifLibelle)).toEqual(["ESSENCE", "EDF"]);
    expect(await repo.list(B)).toEqual([]);
  });

  it("pas d'unicité : 2 règles même (motif, categorie) cohabitent", async () => {
    const repo = new FakeRegleCategorisationRepository();
    await repo.create(A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    await repo.create(A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    expect(await repo.list(A)).toHaveLength(2);
  });

  it("update partiel : actif on/off, motif/categorie ; champs non fournis préservés", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await repo.create(A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    const maj = await repo.update(A, r.id, { actif: false });
    expect(maj?.actif).toBe(false);
    expect(maj?.motifLibelle).toBe("ESSENCE"); // préservé
    const maj2 = await repo.update(A, r.id, { categorie: "deplacements" });
    expect(maj2?.categorie).toBe("deplacements");
    expect(maj2?.actif).toBe(false); // préservé
  });

  it("isolation cross-tenant : B → getById null, update/delete inopérants", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await repo.create(A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    expect(await repo.getById(B, r.id)).toBeNull();
    expect(await repo.update(B, r.id, { actif: false })).toBeNull();
    expect(await repo.delete(B, r.id)).toBe(false);
    expect(await repo.delete(A, r.id)).toBe(true);
  });
});
