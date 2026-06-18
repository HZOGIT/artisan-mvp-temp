import { describe, it, expect } from "vitest";
import { FakeConfigRelancesRepository } from "./config-relances-repository-fake";
import { defaultConfigRelances } from "../domain/config-relances";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("FakeConfigRelancesRepository (singleton get/upsert, sans DB)", () => {
  it("get sans ligne → défauts (jamais null)", async () => {
    const repo = new FakeConfigRelancesRepository();
    expect(await repo.get(A)).toEqual(defaultConfigRelances(1));
  });

  it("upsert crée puis get reflète l'état ; artisanId forcé", async () => {
    const repo = new FakeConfigRelancesRepository();
    const r = await repo.upsert(A, { actif: true, nombreMaxRelances: 5, modeleEmailId: 42 });
    expect(r.artisanId).toBe(1);
    expect(r.actif).toBe(true);
    expect(r.nombreMaxRelances).toBe(5);
    expect(r.modeleEmailId).toBe(42);
    expect((await repo.get(A)).actif).toBe(true);
  });

  it("upsert partiel : les champs non fournis sont préservés", async () => {
    const repo = new FakeConfigRelancesRepository();
    await repo.upsert(A, { actif: true, heureEnvoi: "08:30" });
    const r = await repo.upsert(A, { joursApresEnvoi: 10 });
    expect(r.joursApresEnvoi).toBe(10);
    expect(r.actif).toBe(true); // préservé
    expect(r.heureEnvoi).toBe("08:30"); // préservé
  });

  it("isolation cross-tenant : l'upsert de A n'affecte pas B", async () => {
    const repo = new FakeConfigRelancesRepository();
    await repo.upsert(A, { actif: true });
    expect(await repo.get(B)).toEqual(defaultConfigRelances(2));
  });
});
