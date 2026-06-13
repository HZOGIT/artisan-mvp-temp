import { describe, it, expect, beforeEach } from "vitest";
import { FakeFournisseurRepository } from "../infra/fournisseur-repository-fake";
import { listFournisseurs, getFournisseur } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("fournisseurs — use-cases lecture (repo mocké)", () => {
  let repo: FakeFournisseurRepository;

  beforeEach(async () => {
    repo = new FakeFournisseurRepository();
    await repo.create(A, { nom: "Point P" });
    await repo.create(A, { nom: "Brico" });
    await repo.create(B, { nom: "Cedeo" });
  });

  it("listFournisseurs ne renvoie que les fournisseurs du tenant", async () => {
    expect((await listFournisseurs(repo, A)).map((f) => f.nom).sort()).toEqual(["Brico", "Point P"]);
    expect((await listFournisseurs(repo, B)).map((f) => f.nom)).toEqual(["Cedeo"]);
  });

  it("getFournisseur renvoie le fournisseur du tenant", async () => {
    const [f] = await listFournisseurs(repo, A);
    expect((await getFournisseur(repo, A, f.id)).id).toBe(f.id);
  });

  it("getFournisseur sur une ressource d'un autre tenant → NotFoundError", async () => {
    const [fA] = await listFournisseurs(repo, A);
    await expect(getFournisseur(repo, B, fA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => getFournisseur(repo, B, fA.id));
  });

  it("getFournisseur sur un id inexistant → NotFoundError", async () => {
    await expect(getFournisseur(repo, A, 99999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
