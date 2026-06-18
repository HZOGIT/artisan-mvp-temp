import { describe, it, expect } from "vitest";
import { FakeParametresRepository } from "./parametres-repository-fake";
import { defaultParametres } from "../domain/parametres";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("FakeParametresRepository (singleton get/upsert, sans DB)", () => {
  it("get sans ligne → défauts (jamais null)", async () => {
    const repo = new FakeParametresRepository();
    expect(await repo.get(A)).toEqual(defaultParametres(1));
  });

  it("upsert crée la ligne puis get reflète l'état ; artisanId forcé au tenant", async () => {
    const repo = new FakeParametresRepository();
    const r = await repo.upsert(A, { prefixeFacture: "F2024", delaiPaiementJours: 45 });
    expect(r.artisanId).toBe(1);
    expect(r.prefixeFacture).toBe("F2024");
    expect(r.delaiPaiementJours).toBe(45);
    const got = await repo.get(A);
    expect(got.prefixeFacture).toBe("F2024");
    expect(got.delaiPaiementJours).toBe(45);
  });

  it("upsert partiel : les champs non fournis sont préservés", async () => {
    const repo = new FakeParametresRepository();
    await repo.upsert(A, { prefixeDevis: "D24", conditionsGenerales: "CGV…" });
    const r = await repo.upsert(A, { prefixeDevis: "D25" });
    expect(r.prefixeDevis).toBe("D25");
    expect(r.conditionsGenerales).toBe("CGV…"); // préservé
  });

  it("INVARIANT : upsert ne modifie JAMAIS les compteurs de numérotation", async () => {
    const repo = new FakeParametresRepository();
    repo.seed({ ...defaultParametres(1), compteurFacture: 5, compteurDevis: 12, compteurAvoir: 3 });
    const r = await repo.upsert(A, { prefixeFacture: "NEW" });
    expect(r.prefixeFacture).toBe("NEW");
    expect(r.compteurFacture).toBe(5); // inchangé
    expect(r.compteurDevis).toBe(12);
    expect(r.compteurAvoir).toBe(3);
  });

  it("isolation cross-tenant : l'upsert de A n'affecte pas B", async () => {
    const repo = new FakeParametresRepository();
    await repo.upsert(A, { prefixeFacture: "AAA" });
    const b = await repo.get(B);
    expect(b).toEqual(defaultParametres(2)); // B voit ses défauts, pas A
  });
});
