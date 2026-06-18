import { describe, it, expect } from "vitest";
import { FakeNoteDeFraisRepository } from "../infra/note-de-frais-repository-fake";
import { listNotesDeFrais, getNoteDeFrais, listNotesDeFraisAvecCompte, getNoteFraisDetail } from "./read-use-cases";
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

  // ── OPE-490 : enrichissement dépenses[] / nbDepenses ──────────────────────────────────────────
  it("listNotesDeFraisAvecCompte : nbDepenses = nb de dépenses liées (0 si aucune)", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n1 = await repo.create(A, base({ titre: "Avec 2" }));
    await repo.create(A, base({ titre: "Sans" }));
    repo.registerDepense(A.artisanId, 501, { remboursable: true, montantTtc: "10.00" });
    repo.registerDepense(A.artisanId, 502, { remboursable: true, montantTtc: "20.00" });
    await repo.addDepenseLink(A, n1.id, 501);
    await repo.addDepenseLink(A, n1.id, 502);
    const list = await listNotesDeFraisAvecCompte(repo, A);
    expect(list.find((n) => n.titre === "Avec 2")?.nbDepenses).toBe(2);
    expect(list.find((n) => n.titre === "Sans")?.nbDepenses).toBe(0);
  });

  it("getNoteFraisDetail : note + dépenses liées (détails) ; null si hors tenant", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await repo.create(A, base());
    repo.registerDepense(A.artisanId, 700, { remboursable: true, montantTtc: "33.00", numero: "DEP-700", fournisseur: "Castorama", categorie: "fournitures", dateDepense: "2026-06-10" });
    await repo.addDepenseLink(A, n.id, 700);
    const detail = await getNoteFraisDetail(repo, A, n.id);
    expect(detail?.depenses).toHaveLength(1);
    expect(detail?.depenses[0]).toMatchObject({ id: 700, numero: "DEP-700", fournisseur: "Castorama", montantTtc: "33.00", categorie: "fournitures" });
    expect(detail?.montantTotal).toBe("33"); // recalculé par addDepenseLink
    expect(await getNoteFraisDetail(repo, B, n.id)).toBeNull(); // parité : null hors tenant
  });
});
