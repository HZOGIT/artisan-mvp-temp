import { describe, it, expect, beforeEach } from "vitest";
import { FakeStockRepository } from "../infra/stock-repository-fake";
import { listStocks, getStock } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("stocks — use-cases lecture (repo mocké)", () => {
  let repo: FakeStockRepository;

  beforeEach(async () => {
    repo = new FakeStockRepository();
    await repo.create(A, { reference: "R1", designation: "Tube" });
    await repo.create(A, { reference: "R2", designation: "Coude" });
    await repo.create(B, { reference: "RB", designation: "Vis" });
  });

  it("listStocks ne renvoie que les stocks du tenant", async () => {
    expect((await listStocks(repo, A)).map((s) => s.designation).sort()).toEqual(["Coude", "Tube"]);
    expect((await listStocks(repo, B)).map((s) => s.designation)).toEqual(["Vis"]);
  });

  it("getStock renvoie le stock du tenant", async () => {
    const [s] = await listStocks(repo, A);
    expect((await getStock(repo, A, s.id)).id).toBe(s.id);
  });

  it("getStock sur une ressource d'un autre tenant → NotFoundError", async () => {
    const [sA] = await listStocks(repo, A);
    await expect(getStock(repo, B, sA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => getStock(repo, B, sA.id));
  });

  it("getStock sur un id inexistant → NotFoundError", async () => {
    await expect(getStock(repo, A, 99999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
