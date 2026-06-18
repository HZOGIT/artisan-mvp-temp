import { describe, it, expect } from "vitest";
import { FakeCongeRepository } from "../infra/conge-repository-fake";
import { listConges, getConge } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ technicienId: 100, type: "conge_paye" as const, dateDebut: "2026-07-01", dateFin: "2026-07-05", ...over });

describe("conges — use-cases de lecture", () => {
  it("listConges ne renvoie que les demandes du tenant", async () => {
    const repo = new FakeCongeRepository();
    await repo.create(A, base({ motif: "Chez A" }));
    await repo.create(B, base({ motif: "Chez B" }));
    const list = await listConges(repo, A);
    expect(list.map((c) => c.motif)).toEqual(["Chez A"]);
  });

  it("getConge renvoie la demande du tenant propriétaire", async () => {
    const repo = new FakeCongeRepository();
    const c = await repo.create(A, base({ type: "rtt" }));
    expect((await getConge(repo, A, c.id)).type).toBe("rtt");
  });

  it("getConge sur une demande d'un autre tenant → NotFound", async () => {
    const repo = new FakeCongeRepository();
    const c = await repo.create(A, base());
    await expectCrossTenantDenied(() => getConge(repo, B, c.id));
    await expect(getConge(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getConge sur un id inexistant → NotFound", async () => {
    const repo = new FakeCongeRepository();
    await expect(getConge(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
