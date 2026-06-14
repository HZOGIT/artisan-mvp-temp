import { describe, it, expect } from "vitest";
import { FakeRegleCategorisationRepository } from "../infra/regle-categorisation-repository-fake";
import { listRegles, getRegle } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("regles-categorisation — read use-cases", () => {
  it("listRegles renvoie les règles du tenant", async () => {
    const repo = new FakeRegleCategorisationRepository();
    await repo.create(A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    expect(await listRegles(repo, A)).toHaveLength(1);
    expect(await listRegles(repo, B)).toEqual([]);
  });

  it("getRegle → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await repo.create(A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    expect((await getRegle(repo, A, r.id)).motifLibelle).toBe("ESSENCE");
    await expect(getRegle(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRegle(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
