import { describe, it, expect } from "vitest";
import { FakeCongeRepository } from "./infra/conge-repository-fake";
import { creerConge, modifierConge, approuverConge, annulerConge } from "./application/write-use-cases";
import { getConge } from "./application/read-use-cases";
import { ForbiddenError, NotFoundError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine conges (RH — sensible). Verrouille en un
// seul endroit, indépendamment du transport et de l'infra, les garanties à préserver.
const TECH = 500;
const OWNER: TenantContext = { artisanId: 1, userId: 10 };
const DEMANDEUR: TenantContext = { artisanId: 1, userId: 50 }; // user lié à la fiche TECH
const B: TenantContext = { artisanId: 2, userId: 20 };

function seed(): FakeCongeRepository {
  const repo = new FakeCongeRepository();
  repo.registerTechnicien(1, TECH);
  repo.linkTechnicien(1, 50, TECH);
  return repo;
}
const conge = (over = {}) => ({ technicienId: TECH, type: "conge_paye" as const, dateDebut: "2026-07-01", dateFin: "2026-07-05", ...over });

describe("conges — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD + workflow d'un autre tenant → NotFound", async () => {
    const repo = seed();
    const c = await creerConge(repo, OWNER, conge());
    await expect(getConge(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierConge(repo, B, c.id, { motif: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(approuverConge(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(annulerConge(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("INV-2 : anti self-approbation — le demandeur ne peut approuver sa propre demande → Forbidden", async () => {
    const repo = seed();
    const c = await creerConge(repo, OWNER, conge());
    await expect(approuverConge(repo, DEMANDEUR, c.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getConge(repo, OWNER, c.id)).statut).toBe("en_attente");
  });

  it("INV-3 : anti-IDOR-FK — créer un congé pour un technicien hors tenant → NotFound", async () => {
    const repo = seed(); // TECH appartient à A, pas à B
    await expect(creerConge(repo, B, conge())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("INV-4 : solde idempotent — approuver 2× ne double-décompte pas ; annuler recrédite ; type sans impact n'écrit pas", async () => {
    const repo = seed();
    const c = await creerConge(repo, OWNER, conge());
    await approuverConge(repo, OWNER, c.id);
    await approuverConge(repo, OWNER, c.id); // idempotent
    expect(repo.getJoursPris(1, TECH, "conge_paye", 2026)).toBe(5);
    await annulerConge(repo, OWNER, c.id);
    expect(repo.getJoursPris(1, TECH, "conge_paye", 2026)).toBe(0); // recrédité
    // un type sans impact solde (maladie) n'écrit jamais
    const m = await creerConge(repo, OWNER, conge({ type: "maladie" }));
    await approuverConge(repo, OWNER, m.id);
    expect(repo.getJoursPris(1, TECH, "maladie", 2026)).toBe(0);
  });

  it("INV-5 : statut/validePar inviolables via update — seul le workflow les change", async () => {
    const repo = seed();
    const c = await creerConge(repo, OWNER, conge());
    // `UpdateCongeInput` n'expose pas statut/validePar → un modifier ne peut pas les toucher
    await modifierConge(repo, OWNER, c.id, { motif: "Changé" });
    const after = await getConge(repo, OWNER, c.id);
    expect(after.statut).toBe("en_attente");
    expect(after.validePar).toBeNull();
    expect(after.motif).toBe("Changé");
  });
});
