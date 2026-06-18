import { describe, it, expect } from "vitest";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import { listContrats, getContrat } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ clientId: 100, titre: "Entretien", montantHT: "300.00", periodicite: "annuel" as const, dateDebut: new Date("2026-07-01T00:00:00Z"), ...over });

describe("contrats-maintenance — read use-cases", () => {
  it("listContrats renvoie les contrats du tenant", async () => {
    const repo = new FakeContratRepository();
    await repo.create(A, base(), "CTR-00001");
    expect(await listContrats(repo, A)).toHaveLength(1);
    expect(await listContrats(repo, B)).toEqual([]);
  });

  it("getContrat → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeContratRepository();
    const c = await repo.create(A, base(), "CTR-00001");
    expect((await getContrat(repo, A, c.id)).titre).toBe("Entretien");
    await expect(getContrat(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getContrat(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
