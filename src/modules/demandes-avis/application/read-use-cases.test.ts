import { describe, it, expect } from "vitest";
import { FakeDemandeAvisRepository } from "../infra/demande-avis-repository-fake";
import { listDemandesAvis, demandesAvisParStatut, getDemandeAvis } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("demandes-avis — read use-cases", () => {
  it("listDemandesAvis renvoie les demandes du tenant", async () => {
    const repo = new FakeDemandeAvisRepository();
    await repo.create(A, { clientId: 10, interventionId: 20 });
    expect(await listDemandesAvis(repo, A)).toHaveLength(1);
    expect(await listDemandesAvis(repo, B)).toEqual([]);
  });

  it("demandesAvisParStatut filtre ; [] si aucune", async () => {
    const repo = new FakeDemandeAvisRepository();
    await repo.create(A, { clientId: 10, interventionId: 20 });
    expect(await demandesAvisParStatut(repo, A, "envoyee")).toHaveLength(1);
    expect(await demandesAvisParStatut(repo, A, "completee")).toEqual([]);
  });

  it("getDemandeAvis → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeDemandeAvisRepository();
    const d = await repo.create(A, { clientId: 10, interventionId: 20 });
    expect((await getDemandeAvis(repo, A, d.id)).clientId).toBe(10);
    await expect(getDemandeAvis(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDemandeAvis(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
