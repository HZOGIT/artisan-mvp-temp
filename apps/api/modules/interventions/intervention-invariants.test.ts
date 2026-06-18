import { describe, it, expect } from "vitest";
import { FakeInterventionRepository } from "./infra/intervention-repository-fake";
import { creerIntervention, modifierIntervention, supprimerIntervention } from "./application/write-use-cases";
import { getIntervention, listMesInterventions } from "./application/read-use-cases";
import { NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine interventions (cœur métier terrain).
// Verrouille en un seul endroit, indépendamment du transport et de l'infra, les garanties.
const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const CLIENT_A = 500;
function repoAvecClientA(): FakeInterventionRepository {
  const repo = new FakeInterventionRepository();
  repo.registerRef(1, "client", CLIENT_A);
  return repo;
}
const base = (over = {}) => ({ clientId: CLIENT_A, titre: "Pose", dateDebut: new Date("2026-06-10T08:00:00Z"), ...over });

describe("interventions — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — getById/modifier/supprimer hors tenant → NotFound", async () => {
    const repo = repoAvecClientA();
    const i = await creerIntervention(repo, A, base());
    await expect(getIntervention(repo, B, i.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierIntervention(repo, B, i.id, { titre: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerIntervention(repo, B, i.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getIntervention(repo, A, i.id)).titre).toBe("Pose"); // A intact
  });

  it("INV-2 : anti-IDOR-FK — toute FK liée doit appartenir au tenant", async () => {
    const repo = repoAvecClientA();
    // clientId hors tenant (vu depuis B, CLIENT_A ne lui appartient pas)
    await expect(creerIntervention(repo, B, base())).rejects.toBeInstanceOf(NotFoundError);
    // technicien/devis/facture hors tenant → NotFound
    await expect(creerIntervention(repo, A, base({ technicienId: 999 }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(creerIntervention(repo, A, base({ devisId: 888 }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(creerIntervention(repo, A, base({ factureId: 777 }))).rejects.toBeInstanceOf(NotFoundError);
    // une fois la FK enregistrée comme appartenant au tenant, ça passe
    repo.registerRef(1, "technicien", 999);
    expect((await creerIntervention(repo, A, base({ technicienId: 999 }))).technicienId).toBe(999);
  });

  it("INV-3 : cohérence des dates — dateFin ≥ dateDebut", async () => {
    const repo = repoAvecClientA();
    await expect(
      creerIntervention(repo, A, base({ dateFin: new Date("2026-06-09T00:00:00Z") })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("INV-4 : cloisonnement technicien — un technicien lié ne voit que ses interventions", async () => {
    const repo = repoAvecClientA();
    repo.registerRef(1, "technicien", 10);
    repo.registerRef(1, "technicien", 20);
    await creerIntervention(repo, A, base({ titre: "T1", technicienId: 10 }));
    await creerIntervention(repo, A, base({ titre: "T2", technicienId: 20 }));
    repo.linkTechnicien(1, 10, 10); // user 10 ↔ technicien 10
    const ctxTech: TenantContext = { artisanId: 1, userId: 10, role: "technicien" };
    expect((await listMesInterventions(repo, ctxTech)).map((i) => i.titre)).toEqual(["T1"]);
    // owner voit tout
    expect((await listMesInterventions(repo, { artisanId: 1, userId: 99, role: "artisan" })).length).toBe(2);
  });
});
