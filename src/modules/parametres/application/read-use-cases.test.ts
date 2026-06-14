import { describe, it, expect } from "vitest";
import { FakeParametresRepository } from "../infra/parametres-repository-fake";
import { getParametres } from "./read-use-cases";
import { defaultParametres } from "../domain/parametres";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe("parametres — read use-cases", () => {
  it("getParametres renvoie les défauts si aucune config (singleton, pas de NotFound)", async () => {
    const repo = new FakeParametresRepository();
    expect(await getParametres(repo, ctx(7))).toEqual(defaultParametres(7));
  });

  it("getParametres reflète l'état après upsert", async () => {
    const repo = new FakeParametresRepository();
    await repo.upsert(ctx(7), { prefixeFacture: "F-7" });
    expect((await getParametres(repo, ctx(7))).prefixeFacture).toBe("F-7");
  });

  it("getParametres est scopé au tenant", async () => {
    const repo = new FakeParametresRepository();
    await repo.upsert(ctx(7), { prefixeFacture: "F-7" });
    expect((await getParametres(repo, ctx(8))).prefixeFacture).toBe(defaultParametres(8).prefixeFacture);
  });
});
