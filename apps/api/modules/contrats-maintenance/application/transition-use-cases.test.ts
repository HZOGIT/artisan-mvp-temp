import { describe, it, expect } from "vitest";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import { suspendreContrat, reactiverContrat, terminerContrat, annulerContrat, peutTransitionner } from "./transition-use-cases";
import { ConflictError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ clientId: 100, titre: "Entretien", montantHT: "300.00", periodicite: "annuel" as const, dateDebut: new Date("2026-07-01T00:00:00Z"), ...over });
const creer = (repo: FakeContratRepository) => repo.create(A, base(), "CTR-00001");

describe("contrats-maintenance — transition use-cases (état machine)", () => {
  it("peutTransitionner : table des transitions autorisées", () => {
    expect(peutTransitionner("actif", "suspendu")).toBe(true);
    expect(peutTransitionner("actif", "termine")).toBe(true);
    expect(peutTransitionner("actif", "annule")).toBe(true);
    expect(peutTransitionner("suspendu", "actif")).toBe(true);
    expect(peutTransitionner("actif", "actif")).toBe(false);
    expect(peutTransitionner("termine", "actif")).toBe(false);
    expect(peutTransitionner("annule", "suspendu")).toBe(false);
  });

  it("suspendre depuis actif → suspendu ; reactiver depuis suspendu → actif", async () => {
    const repo = new FakeContratRepository();
    const c = await creer(repo);
    expect((await suspendreContrat(repo, A, c.id)).statut).toBe("suspendu");
    expect((await reactiverContrat(repo, A, c.id)).statut).toBe("actif");
  });

  it("terminer / annuler depuis actif ou suspendu", async () => {
    const repo = new FakeContratRepository();
    const c1 = await creer(repo);
    expect((await terminerContrat(repo, A, c1.id)).statut).toBe("termine");
    const c2 = await repo.create(A, base(), "CTR-00002");
    await suspendreContrat(repo, A, c2.id);
    expect((await annulerContrat(repo, A, c2.id)).statut).toBe("annule");
  });

  it("INVARIANT : transitions depuis états terminaux (termine/annule) → ConflictError", async () => {
    const repo = new FakeContratRepository();
    const c = await creer(repo);
    await terminerContrat(repo, A, c.id);
    await expect(suspendreContrat(repo, A, c.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(reactiverContrat(repo, A, c.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(annulerContrat(repo, A, c.id)).rejects.toBeInstanceOf(ConflictError);

    const c2 = await repo.create(A, base(), "CTR-00002");
    await annulerContrat(repo, A, c2.id);
    await expect(terminerContrat(repo, A, c2.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("INVARIANT : reactiver un contrat déjà actif → ConflictError", async () => {
    const repo = new FakeContratRepository();
    const c = await creer(repo);
    await expect(reactiverContrat(repo, A, c.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("transition sur un contrat d'un autre tenant ou inexistant → NotFound", async () => {
    const repo = new FakeContratRepository();
    const c = await creer(repo);
    await expect(suspendreContrat(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(annulerContrat(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
