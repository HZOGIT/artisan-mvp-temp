import { describe, it, expect } from "vitest";
import { FakeRdvRepository } from "../infra/rdv-repository-fake";
import { listRdvs, getRdv } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ clientId: 100, titre: "Dépannage", dateProposee: new Date("2026-07-01T10:00:00Z"), ...over });

describe("rdv-en-ligne — read use-cases", () => {
  it("listRdvs renvoie les RDV du tenant", async () => {
    const repo = new FakeRdvRepository();
    await repo.create(A, base());
    expect(await listRdvs(repo, A)).toHaveLength(1);
    expect(await listRdvs(repo, B)).toEqual([]);
  });

  it("getRdv → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    expect((await getRdv(repo, A, r.id)).titre).toBe("Dépannage");
    await expect(getRdv(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRdv(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
