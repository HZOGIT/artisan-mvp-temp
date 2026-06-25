import { describe, it, expect } from "vitest";
import { FakeCongeRepository } from "../infra/conge-repository-fake";
import { creerConge, modifierConge, supprimerConge, approuverConge } from "./write-use-cases";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const TECH_A = 500;
function repoAvecTechA(): FakeCongeRepository {
  const repo = new FakeCongeRepository();
  repo.registerTechnicien(1, TECH_A);
  return repo;
}
const base = (over = {}) => ({ technicienId: TECH_A, type: "conge_paye" as const, dateDebut: "2026-07-01", dateFin: "2026-07-05", ...over });

describe("conges — use-cases d'écriture (create / update)", () => {
  it("creerConge OK quand le technicien appartient au tenant", async () => {
    const repo = repoAvecTechA();
    const c = await creerConge(repo, A, base());
    expect(c.id).toBeGreaterThan(0);
    expect(c.technicienId).toBe(TECH_A);
    expect(c.statut).toBe("en_attente");
  });

  it("creerConge : dateFin < dateDebut → ValidationError", async () => {
    const repo = repoAvecTechA();
    await expect(creerConge(repo, A, base({ dateFin: "2026-06-30" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("ANTI-IDOR-FK : creerConge avec un technicienId hors tenant → NotFound", async () => {
    const repo = repoAvecTechA(); // TECH_A appartient à A, pas à B
    await expect(creerConge(repo, B, base())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("modifierConge OK / dates incohérentes → Validation / cross-tenant → NotFound", async () => {
    const repo = repoAvecTechA();
    const c = await creerConge(repo, A, base());
    const maj = await modifierConge(repo, A, c.id, { motif: "Mis à jour" });
    expect(maj.motif).toBe("Mis à jour");
    await expect(modifierConge(repo, A, c.id, { dateDebut: "2026-07-10", dateFin: "2026-07-05" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(modifierConge(repo, B, c.id, { motif: "hack" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("modifierConge : statut != en_attente → ConflictError (OPE-497)", async () => {
    const repo = repoAvecTechA();
    const c = await creerConge(repo, A, base());
    await approuverConge(repo, A, c.id);
    await expect(modifierConge(repo, A, c.id, { motif: "trop tard" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("supprimerConge OK / cross-tenant → NotFound", async () => {
    const repo = repoAvecTechA();
    const c = await creerConge(repo, A, base());
    await expect(supprimerConge(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerConge(repo, A, c.id);
    await expect(supprimerConge(repo, A, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
