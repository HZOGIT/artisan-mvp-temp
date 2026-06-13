import { describe, it, expect } from "vitest";
import { FakeNoteDeFraisRepository } from "./infra/note-de-frais-repository-fake";
import {
  creerNoteDeFrais,
  modifierNoteDeFrais,
  soumettreNoteDeFrais,
  approuverNoteDeFrais,
  rejeterNoteDeFrais,
} from "./application/write-use-cases";
import { getNoteDeFrais } from "./application/read-use-cases";
import { ConflictError, ForbiddenError, NotFoundError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine notes-de-frais (RH/compta — sensible).
const DEMANDEUR: TenantContext = { artisanId: 1, userId: 50 };
const APPROBATEUR: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ numero: "NDF-1", titre: "Frais", periodeDebut: "2026-06-01", periodeFin: "2026-06-30", ...over });

describe("notes-de-frais — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD + workflow d'un autre tenant → NotFound", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await creerNoteDeFrais(repo, DEMANDEUR, base());
    await expect(getNoteDeFrais(repo, B, n.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierNoteDeFrais(repo, B, n.id, { titre: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(soumettreNoteDeFrais(repo, B, n.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("INV-2 : créer pour soi — userId est toujours l'utilisateur courant", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await creerNoteDeFrais(repo, DEMANDEUR, base());
    expect(n.userId).toBe(50); // ctx.userId
  });

  it("INV-3 : anti self-approbation — le demandeur ne peut approuver/rejeter sa propre note", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await creerNoteDeFrais(repo, DEMANDEUR, base());
    await soumettreNoteDeFrais(repo, DEMANDEUR, n.id);
    await expect(approuverNoteDeFrais(repo, DEMANDEUR, n.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rejeterNoteDeFrais(repo, DEMANDEUR, n.id, "Non")).rejects.toBeInstanceOf(ForbiddenError);
    // un approbateur distinct peut, lui, approuver
    expect((await approuverNoteDeFrais(repo, APPROBATEUR, n.id)).statut).toBe("approuvee");
  });

  it("INV-4 : transitions — brouillon→soumise→approuvee ; transition arbitraire → Conflict ; idempotence", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await creerNoteDeFrais(repo, DEMANDEUR, base());
    // approuver une note brouillon (non soumise) → Conflict
    await expect(approuverNoteDeFrais(repo, APPROBATEUR, n.id)).rejects.toBeInstanceOf(ConflictError);
    await soumettreNoteDeFrais(repo, DEMANDEUR, n.id);
    expect((await soumettreNoteDeFrais(repo, DEMANDEUR, n.id)).statut).toBe("soumise"); // idempotent
    await approuverNoteDeFrais(repo, APPROBATEUR, n.id);
    expect((await approuverNoteDeFrais(repo, APPROBATEUR, n.id)).statut).toBe("approuvee"); // idempotent
  });

  it("INV-5 : statut/userId inviolables via update — seuls le workflow / la création les fixent", async () => {
    const repo = new FakeNoteDeFraisRepository();
    const n = await creerNoteDeFrais(repo, DEMANDEUR, base());
    // `UpdateNoteDeFraisInput` n'expose ni statut ni userId → un modifier ne peut pas les toucher
    await modifierNoteDeFrais(repo, DEMANDEUR, n.id, { titre: "Renommée" });
    const after = await getNoteDeFrais(repo, DEMANDEUR, n.id);
    expect(after.statut).toBe("brouillon");
    expect(after.userId).toBe(50);
    expect(after.titre).toBe("Renommée");
  });
});
