import { describe, it, expect } from "vitest";
import { FakeNoteDeFraisRepository } from "../infra/note-de-frais-repository-fake";
import {
  soumettreNoteDeFrais,
  approuverNoteDeFrais,
  rejeterNoteDeFrais,
  payerNoteDeFrais,
} from "./write-use-cases";
import { ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

// DEMANDEUR = user 50 (crée la note) ; APPROBATEUR = user 10 (≠ demandeur) ; B = autre tenant.
const DEMANDEUR: TenantContext = { artisanId: 1, userId: 50 };
const APPROBATEUR: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

async function noteSoumise(repo: FakeNoteDeFraisRepository) {
  // créée par le demandeur (userId forcé à 50), puis soumise.
  const n = await repo.create(DEMANDEUR, { userId: 50, numero: "NDF-1", titre: "Frais", periodeDebut: "2026-06-01", periodeFin: "2026-06-30" });
  await soumettreNoteDeFrais(repo, DEMANDEUR, n.id);
  return n;
}

describe("notes-de-frais — workflow (anti self-approbation + transitions)", () => {
  it("soumettre : brouillon→soumise + date de soumission ; idempotent", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await repo.create(DEMANDEUR, { userId: 50, numero: "N", titre: "T", periodeDebut: "2026-06-01", periodeFin: "2026-06-30" });
    const s = await soumettreNoteDeFrais(repo, DEMANDEUR, n.id);
    expect(s.statut).toBe("soumise");
    expect(s.dateSoumission).not.toBeNull();
    expect((await soumettreNoteDeFrais(repo, DEMANDEUR, n.id)).statut).toBe("soumise"); // idempotent
  });

  it("approuver par un approbateur ≠ demandeur : soumise→approuvee + date + commentaire", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await noteSoumise(repo);
    const a = await approuverNoteDeFrais(repo, APPROBATEUR, n.id, "OK");
    expect(a.statut).toBe("approuvee");
    expect(a.dateApprobation).not.toBeNull();
    expect(a.commentaireApprobateur).toBe("OK");
  });

  it("ANTI SELF-APPROBATION : le demandeur ne peut pas approuver sa propre note → Forbidden", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await noteSoumise(repo);
    await expect(approuverNoteDeFrais(repo, DEMANDEUR, n.id)).rejects.toBeInstanceOf(ForbiddenError);
    // la note reste soumise
    expect((await repo.getById(DEMANDEUR, n.id))?.statut).toBe("soumise");
  });

  it("ANTI SELF-APPROBATION s'applique aussi au rejet", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await noteSoumise(repo);
    await expect(rejeterNoteDeFrais(repo, DEMANDEUR, n.id, "Non")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("transition invalide : approuver une note brouillon (non soumise) → Conflict", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await repo.create(DEMANDEUR, { userId: 50, numero: "N", titre: "T", periodeDebut: "2026-06-01", periodeFin: "2026-06-30" });
    await expect(approuverNoteDeFrais(repo, APPROBATEUR, n.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("payer : approuvee→payee + date de paiement ; payer une note non approuvée → Conflict", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await noteSoumise(repo);
    await expect(payerNoteDeFrais(repo, APPROBATEUR, n.id)).rejects.toBeInstanceOf(ConflictError); // encore soumise
    await approuverNoteDeFrais(repo, APPROBATEUR, n.id);
    const p = await payerNoteDeFrais(repo, APPROBATEUR, n.id);
    expect(p.statut).toBe("payee");
    expect(p.datePaiement).not.toBeNull();
  });

  it("rejeter : soumise→rejetee + commentaire", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await noteSoumise(repo);
    const r = await rejeterNoteDeFrais(repo, APPROBATEUR, n.id, "Justificatifs manquants");
    expect(r.statut).toBe("rejetee");
    expect(r.commentaireApprobateur).toBe("Justificatifs manquants");
  });

  it("cross-tenant : soumettre/approuver/payer une note d'un autre tenant → NotFound", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await noteSoumise(repo);
    await expect(soumettreNoteDeFrais(repo, B, n.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(approuverNoteDeFrais(repo, B, n.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(payerNoteDeFrais(repo, B, n.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
