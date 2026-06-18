import { describe, it, expect } from "vitest";
import { FakeModeleDevisRepository } from "../infra/modele-devis-repository-fake";
import { listModelesDevis, getModeleDevis } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("modeles-devis — read use-cases", () => {
  it("listModelesDevis renvoie les en-têtes du tenant (léger)", async () => {
    const repo = new FakeModeleDevisRepository();
    await repo.create(A, { nom: "T", lignes: [{ designation: "L" }] });
    const list = await listModelesDevis(repo, A);
    expect(list).toHaveLength(1);
    expect(list[0].lignes).toEqual([]); // léger
    expect(await listModelesDevis(repo, B)).toEqual([]);
  });

  it("getModeleDevis renvoie l'agrégat ; NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await repo.create(A, { nom: "T", lignes: [{ designation: "L" }] });
    expect((await getModeleDevis(repo, A, m.id)).lignes).toHaveLength(1);
    await expect(getModeleDevis(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getModeleDevis(repo, B, m.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
