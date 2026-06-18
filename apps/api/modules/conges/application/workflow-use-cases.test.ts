import { describe, it, expect } from "vitest";
import { FakeCongeRepository } from "../infra/conge-repository-fake";
import { creerConge, approuverConge, refuserConge, annulerConge } from "./write-use-cases";
import { ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const TECH_DEMANDEUR = 500;

// Contextes : OWNER = user 10 (non lié à une fiche technicien) ; DEMANDEUR = user 50 lié à
// la fiche technicien 500 (le demandeur du congé).
const OWNER: TenantContext = { artisanId: 1, userId: 10 };
const DEMANDEUR: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

function repoSeed(): FakeCongeRepository {
  const repo = new FakeCongeRepository();
  repo.registerTechnicien(1, TECH_DEMANDEUR);
  repo.linkTechnicien(1, 50, TECH_DEMANDEUR); // user 50 = le technicien demandeur
  return repo;
}
const base = () => ({ technicienId: TECH_DEMANDEUR, type: "conge_paye" as const, dateDebut: "2026-07-01", dateFin: "2026-07-05" });

describe("conges — workflow d'approbation (anti self-approbation + transitions)", () => {
  it("approuverConge OK par un approbateur ≠ demandeur (owner)", async () => {
    const repo = repoSeed();
    const c = await creerConge(repo, OWNER, base());
    const maj = await approuverConge(repo, OWNER, c.id, "OK");
    expect(maj.statut).toBe("approuve");
    expect(maj.validePar).toBe(10); // user owner
    expect(maj.commentaireValidation).toBe("OK");
  });

  it("ANTI SELF-APPROBATION : le demandeur ne peut pas approuver sa propre demande → Forbidden", async () => {
    const repo = repoSeed();
    const c = await creerConge(repo, OWNER, base());
    // DEMANDEUR (user 50) est lié à la fiche technicien 500 = le demandeur
    await expect(approuverConge(repo, DEMANDEUR, c.id)).rejects.toBeInstanceOf(ForbiddenError);
    // la demande reste en_attente (non approuvée)
    expect((await repo.getById(OWNER, c.id))?.statut).toBe("en_attente");
  });

  it("idempotence : approuver une demande déjà approuvée est un no-op (pas d'erreur, statut inchangé)", async () => {
    const repo = repoSeed();
    const c = await creerConge(repo, OWNER, base());
    await approuverConge(repo, OWNER, c.id);
    const second = await approuverConge(repo, OWNER, c.id);
    expect(second.statut).toBe("approuve");
  });

  it("transition invalide : approuver une demande refusée → Conflict", async () => {
    const repo = repoSeed();
    const c = await creerConge(repo, OWNER, base());
    await refuserConge(repo, OWNER, c.id, "Non");
    await expect(approuverConge(repo, OWNER, c.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuserConge OK depuis en_attente ; annulerConge OK depuis approuve", async () => {
    const repo = repoSeed();
    const c1 = await creerConge(repo, OWNER, base());
    expect((await refuserConge(repo, OWNER, c1.id)).statut).toBe("refuse");
    const c2 = await creerConge(repo, OWNER, base());
    await approuverConge(repo, OWNER, c2.id);
    expect((await annulerConge(repo, OWNER, c2.id)).statut).toBe("annule");
  });

  it("annuler une demande refusée → Conflict ; annuler 2× → idempotent", async () => {
    const repo = repoSeed();
    const c = await creerConge(repo, OWNER, base());
    await refuserConge(repo, OWNER, c.id);
    await expect(annulerConge(repo, OWNER, c.id)).rejects.toBeInstanceOf(ConflictError);
    const c2 = await creerConge(repo, OWNER, base());
    await annulerConge(repo, OWNER, c2.id);
    expect((await annulerConge(repo, OWNER, c2.id)).statut).toBe("annule"); // idempotent
  });

  it("cross-tenant : approuver/refuser/annuler une demande d'un autre tenant → NotFound", async () => {
    const repo = repoSeed();
    const c = await creerConge(repo, OWNER, base());
    await expect(approuverConge(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(refuserConge(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(annulerConge(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
