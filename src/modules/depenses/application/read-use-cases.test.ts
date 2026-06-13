import { describe, it, expect } from "vitest";
import { FakeDepenseRepository } from "../infra/depense-repository-fake";
import { listDepenses, getDepense } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({
  userId: 100,
  numero: "DEP-1",
  dateDepense: "2026-06-15",
  categorie: "fournitures",
  montantHt: "100.00",
  montantTtc: "120.00",
  ...over,
});

describe("depenses — use-cases de lecture", () => {
  it("listDepenses ne renvoie que les dépenses du tenant", async () => {
    const repo = new FakeDepenseRepository();
    await repo.create(A, base({ description: "Chez A" }));
    await repo.create(B, base({ description: "Chez B" }));
    const list = await listDepenses(repo, A);
    expect(list.map((d) => d.description)).toEqual(["Chez A"]);
  });

  it("getDepense renvoie la dépense du tenant propriétaire", async () => {
    const repo = new FakeDepenseRepository();
    const d = await repo.create(A, base({ montantTtc: "42.00" }));
    expect((await getDepense(repo, A, d.id)).montantTtc).toBe("42.00");
  });

  it("getDepense sur une dépense d'un autre tenant → NotFound", async () => {
    const repo = new FakeDepenseRepository();
    const d = await repo.create(A, base({ description: "Secret" }));
    await expectCrossTenantDenied(() => getDepense(repo, B, d.id));
    await expect(getDepense(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getDepense sur un id inexistant → NotFound", async () => {
    const repo = new FakeDepenseRepository();
    await expect(getDepense(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
