import { describe, it, expect } from "vitest";
import { FakeContratRepository } from "./infra/contrat-repository-fake";
import { creerContrat, modifierContrat, supprimerContrat } from "./application/write-use-cases";
import { getContrat, listContrats } from "./application/read-use-cases";
import { suspendreContrat, reactiverContrat, terminerContrat, annulerContrat } from "./application/transition-use-cases";
import { ConflictError, NotFoundError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine contrats-maintenance (CRUD + anti-IDOR +
// référence serveur + état machine).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ clientId: 100, titre: "Entretien", montantHT: "300.00", periodicite: "annuel" as const, dateDebut: new Date("2026-07-01T00:00:00Z"), ...over });
function repoA() {
  const repo = new FakeContratRepository();
  repo.seedClient(1, 100);
  return repo;
}

describe("contrats-maintenance — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD + transitions d'un autre tenant → NotFound/[]", async () => {
    const repo = repoA();
    const c = await creerContrat(repo, A, base());
    await expect(getContrat(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierContrat(repo, B, c.id, { titre: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(suspendreContrat(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerContrat(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listContrats(repo, B)).toEqual([]);
  });

  it("INV-2 : artisanId forcé — create scope toujours au tenant courant", async () => {
    const repo = repoA();
    const c = await creerContrat(repo, A, base());
    expect(c.artisanId).toBe(1);
  });

  it("INV-3 : anti-IDOR clientId — creerContrat avec un clientId non possédé → NotFound", async () => {
    const repo = repoA();
    await expect(creerContrat(repo, A, base({ clientId: 999 }))).rejects.toBeInstanceOf(NotFoundError);
    const ok = await creerContrat(repo, A, base({ clientId: 100 }));
    expect(ok.clientId).toBe(100);
  });

  it("INV-4 : reference serveur (CTR-xxxxx, non fournie ; update ne la change pas) + statut initial actif", async () => {
    const repo = repoA();
    const c = await creerContrat(repo, A, base());
    expect(c.reference).toMatch(/^CTR-\d{5}$/);
    expect(c.statut).toBe("actif");
    const maj = await modifierContrat(repo, A, c.id, { titre: "Modifié" });
    expect(maj.reference).toBe(c.reference); // inchangée
    expect(maj.statut).toBe("actif"); // inchangé
  });

  it("INV-5 : état machine — actif→suspendu→actif OK ; terminaux termine/annule → ConflictError", async () => {
    const repo = repoA();
    const c = await creerContrat(repo, A, base());
    expect((await suspendreContrat(repo, A, c.id)).statut).toBe("suspendu");
    expect((await reactiverContrat(repo, A, c.id)).statut).toBe("actif");
    expect((await terminerContrat(repo, A, c.id)).statut).toBe("termine");
    await expect(suspendreContrat(repo, A, c.id)).rejects.toBeInstanceOf(ConflictError); // terminal
    const c2 = await creerContrat(repo, A, base());
    await annulerContrat(repo, A, c2.id);
    await expect(reactiverContrat(repo, A, c2.id)).rejects.toBeInstanceOf(ConflictError); // terminal
  });
});
