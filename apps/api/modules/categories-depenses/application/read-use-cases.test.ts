import { describe, it, expect } from "vitest";
import { FakeCategorieDepenseRepository } from "../infra/categorie-depense-repository-fake";
import { listCategories, getCategorie } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("categories-depenses — read use-cases", () => {
  it("listCategories renvoie les catégories du tenant", async () => {
    const repo = new FakeCategorieDepenseRepository();
    await repo.create(A, { nom: "Carburant" });
    expect(await listCategories(repo, A)).toHaveLength(1);
    expect(await listCategories(repo, B)).toEqual([]);
  });

  it("getCategorie → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeCategorieDepenseRepository();
    const c = await repo.create(A, { nom: "Carburant" });
    expect((await getCategorie(repo, A, c.id)).nom).toBe("Carburant");
    await expect(getCategorie(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCategorie(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
