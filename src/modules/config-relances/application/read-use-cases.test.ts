import { describe, it, expect } from "vitest";
import { FakeConfigRelancesRepository } from "../infra/config-relances-repository-fake";
import { getConfigRelances } from "./read-use-cases";
import { defaultConfigRelances } from "../domain/config-relances";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe("config-relances — read use-cases", () => {
  it("getConfigRelances renvoie les défauts si aucune config (singleton, pas de NotFound)", async () => {
    const repo = new FakeConfigRelancesRepository();
    expect(await getConfigRelances(repo, ctx(7))).toEqual(defaultConfigRelances(7));
  });

  it("getConfigRelances reflète l'état après upsert", async () => {
    const repo = new FakeConfigRelancesRepository();
    await repo.upsert(ctx(7), { actif: true });
    expect((await getConfigRelances(repo, ctx(7))).actif).toBe(true);
  });

  it("getConfigRelances est scopé au tenant", async () => {
    const repo = new FakeConfigRelancesRepository();
    await repo.upsert(ctx(7), { actif: true });
    expect((await getConfigRelances(repo, ctx(8))).actif).toBe(false);
  });
});
