import { describe, it, expect } from "vitest";
import { FakeNoteDeFraisRepository } from "../infra/note-de-frais-repository-fake";
import { creerNoteDeFrais, modifierNoteDeFrais, supprimerNoteDeFrais } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 77 };
const B: TenantContext = { artisanId: 2, userId: 88 };

const base = (over = {}) => ({ numero: "NDF-1", titre: "Frais juin", periodeDebut: "2026-06-01", periodeFin: "2026-06-30", ...over });

describe("notes-de-frais — use-cases d'écriture (create / update)", () => {
  it("creerNoteDeFrais force le demandeur à l'utilisateur courant (pas d'IDOR)", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await creerNoteDeFrais(repo, A, base());
    expect(n.id).toBeGreaterThan(0);
    expect(n.userId).toBe(77); // ctx.userId, jamais un id arbitraire
    expect(n.statut).toBe("brouillon");
  });

  it("creerNoteDeFrais : titre vide / numéro vide → ValidationError", async () => {
    const repo = new FakeNoteDeFraisRepository();
    await expect(creerNoteDeFrais(repo, A, base({ titre: "  " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerNoteDeFrais(repo, A, base({ numero: "" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerNoteDeFrais : periodeFin < periodeDebut → ValidationError", async () => {
    const repo = new FakeNoteDeFraisRepository();
    await expect(creerNoteDeFrais(repo, A, base({ periodeFin: "2026-05-31" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerNoteDeFrais : montant négatif → ValidationError", async () => {
    const repo = new FakeNoteDeFraisRepository();
    await expect(creerNoteDeFrais(repo, A, base({ montantTotal: "-10.00" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("modifierNoteDeFrais OK ; dates incohérentes → Validation ; cross-tenant → NotFound", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await creerNoteDeFrais(repo, A, base());
    const maj = await modifierNoteDeFrais(repo, A, n.id, { titre: "Mis à jour" });
    expect(maj.titre).toBe("Mis à jour");
    await expect(
      modifierNoteDeFrais(repo, A, n.id, { periodeDebut: "2026-07-10", periodeFin: "2026-07-05" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(modifierNoteDeFrais(repo, B, n.id, { titre: "hack" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("supprimerNoteDeFrais OK / cross-tenant → NotFound", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await creerNoteDeFrais(repo, A, base());
    await expect(supprimerNoteDeFrais(repo, B, n.id)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerNoteDeFrais(repo, A, n.id);
    await expect(supprimerNoteDeFrais(repo, A, n.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
