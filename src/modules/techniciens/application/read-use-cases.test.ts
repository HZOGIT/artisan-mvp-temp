import { describe, it, expect, beforeEach } from "vitest";
import { FakeTechnicienRepository } from "../infra/technicien-repository-fake";
import { listTechniciens, getTechnicien } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("techniciens — use-cases lecture (repo mocké)", () => {
  let repo: FakeTechnicienRepository;

  beforeEach(async () => {
    repo = new FakeTechnicienRepository();
    await repo.create(A, { nom: "Martin" });
    await repo.create(A, { nom: "Durand" });
    await repo.create(B, { nom: "Bernard" });
  });

  it("listTechniciens ne renvoie que les techniciens du tenant", async () => {
    expect((await listTechniciens(repo, A)).map((t) => t.nom).sort()).toEqual(["Durand", "Martin"]);
    expect((await listTechniciens(repo, B)).map((t) => t.nom)).toEqual(["Bernard"]);
  });

  it("getTechnicien renvoie le technicien du tenant", async () => {
    const [t] = await listTechniciens(repo, A);
    expect((await getTechnicien(repo, A, t.id)).id).toBe(t.id);
  });

  it("getTechnicien sur une ressource d'un autre tenant → NotFoundError", async () => {
    const [tA] = await listTechniciens(repo, A);
    await expect(getTechnicien(repo, B, tA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => getTechnicien(repo, B, tA.id));
  });

  it("getTechnicien sur un id inexistant → NotFoundError", async () => {
    await expect(getTechnicien(repo, A, 99999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
