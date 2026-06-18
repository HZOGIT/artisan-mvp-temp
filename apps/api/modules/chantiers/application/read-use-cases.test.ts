import { describe, it, expect } from "vitest";
import { FakeChantierRepository } from "../infra/chantier-repository-fake";
import { listChantiers, getChantier } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ clientId: 100, reference: "CH-1", nom: "Chantier", ...over });

describe("chantiers — use-cases de lecture", () => {
  it("listChantiers ne renvoie que les chantiers du tenant", async () => {
    const repo = new FakeChantierRepository();
    await repo.create(A, base({ nom: "Chez A" }));
    await repo.create(B, base({ nom: "Chez B" }));
    const list = await listChantiers(repo, A);
    expect(list.map((c) => c.nom)).toEqual(["Chez A"]);
  });

  it("getChantier renvoie le chantier du tenant propriétaire", async () => {
    const repo = new FakeChantierRepository();
    const c = await repo.create(A, base({ nom: "Rénovation" }));
    expect((await getChantier(repo, A, c.id)).nom).toBe("Rénovation");
  });

  it("getChantier sur un chantier d'un autre tenant → NotFound", async () => {
    const repo = new FakeChantierRepository();
    const c = await repo.create(A, base({ nom: "Secret" }));
    await expectCrossTenantDenied(() => getChantier(repo, B, c.id));
    await expect(getChantier(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getChantier sur un id inexistant → NotFound", async () => {
    const repo = new FakeChantierRepository();
    await expect(getChantier(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
