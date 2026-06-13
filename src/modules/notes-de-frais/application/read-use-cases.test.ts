import { describe, it, expect } from "vitest";
import { FakeNoteDeFraisRepository } from "../infra/note-de-frais-repository-fake";
import { listNotesDeFrais, getNoteDeFrais } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ userId: 100, numero: "NDF-1", titre: "Frais", periodeDebut: "2026-06-01", periodeFin: "2026-06-30", ...over });

describe("notes-de-frais — use-cases de lecture", () => {
  it("listNotesDeFrais ne renvoie que les notes du tenant", async () => {
    const repo = new FakeNoteDeFraisRepository();
    await repo.create(A, base({ titre: "Chez A" }));
    await repo.create(B, base({ titre: "Chez B" }));
    const list = await listNotesDeFrais(repo, A);
    expect(list.map((n) => n.titre)).toEqual(["Chez A"]);
  });

  it("getNoteDeFrais renvoie la note du tenant propriétaire", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await repo.create(A, base({ montantTotal: "42.00" }));
    expect((await getNoteDeFrais(repo, A, n.id)).montantTotal).toBe("42.00");
  });

  it("getNoteDeFrais sur une note d'un autre tenant → NotFound", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await repo.create(A, base({ titre: "Secret" }));
    await expectCrossTenantDenied(() => getNoteDeFrais(repo, B, n.id));
    await expect(getNoteDeFrais(repo, B, n.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getNoteDeFrais sur un id inexistant → NotFound", async () => {
    const repo = new FakeNoteDeFraisRepository();
    await expect(getNoteDeFrais(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
