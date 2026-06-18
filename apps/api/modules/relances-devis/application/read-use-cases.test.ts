import { describe, it, expect } from "vitest";
import { FakeRelanceDevisRepository } from "../infra/relance-devis-repository-fake";
import { listRelances, relancesParDevis, getRelance } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ devisId: 100, type: "email" as const, ...over });

describe("relances-devis — read use-cases", () => {
  it("listRelances renvoie les relances du tenant", async () => {
    const repo = new FakeRelanceDevisRepository();
    await repo.create(A, base());
    expect(await listRelances(repo, A)).toHaveLength(1);
    expect(await listRelances(repo, B)).toEqual([]);
  });

  it("relancesParDevis filtre par devis (scopé) ; [] si aucune", async () => {
    const repo = new FakeRelanceDevisRepository();
    await repo.create(A, base({ devisId: 100 }));
    await repo.create(A, base({ devisId: 200 }));
    expect(await relancesParDevis(repo, A, 100)).toHaveLength(1);
    expect(await relancesParDevis(repo, A, 999)).toEqual([]);
  });

  it("getRelance → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeRelanceDevisRepository();
    const r = await repo.create(A, base());
    expect((await getRelance(repo, A, r.id)).devisId).toBe(100);
    await expect(getRelance(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRelance(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
