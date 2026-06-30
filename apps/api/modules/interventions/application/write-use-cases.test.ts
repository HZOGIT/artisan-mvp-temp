import { describe, it, expect } from "vitest";
import { FakeInterventionRepository } from "../infra/intervention-repository-fake";
import { creerIntervention, modifierIntervention, supprimerIntervention } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

// Helper : un repo où le client `CLIENT_A` appartient à A.
const CLIENT_A = 500;
function repoAvecClientA(): FakeInterventionRepository {
  const repo = new FakeInterventionRepository();
  repo.registerRef(1, "client", CLIENT_A);
  return repo;
}

const base = (over: Partial<Parameters<typeof creerIntervention>[2]> = {}) => ({
  clientId: CLIENT_A,
  titre: "Pose",
  dateDebut: new Date("2026-06-10T08:00:00Z"),
  ...over,
});

describe("interventions — use-cases d'écriture (create / update)", () => {
  it("creerIntervention OK quand le client appartient au tenant", async () => {
    const repo = repoAvecClientA();
    const i = await creerIntervention(repo, A, base());
    expect(i.id).toBeGreaterThan(0);
    expect(i.clientId).toBe(CLIENT_A);
  });

  it("creerIntervention : titre vide → ValidationError", async () => {
    const repo = repoAvecClientA();
    await expect(creerIntervention(repo, A, base({ titre: "  " }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerIntervention : dateFin < dateDebut → ValidationError", async () => {
    const repo = repoAvecClientA();
    await expect(
      creerIntervention(repo, A, base({ dateFin: new Date("2026-06-09T08:00:00Z") })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("ANTI-IDOR-FK : creerIntervention avec un clientId hors tenant → NotFound", async () => {
    const repo = repoAvecClientA(); // CLIENT_A appartient à A, pas à B
    await expect(creerIntervention(repo, B, base())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ANTI-IDOR-FK : creerIntervention avec un technicienId hors tenant → NotFound", async () => {
    const repo = repoAvecClientA(); // technicien 999 non enregistré pour A
    await expect(
      creerIntervention(repo, A, base({ technicienId: 999 })),
    ).rejects.toBeInstanceOf(NotFoundError);
    // avec le technicien enregistré, ça passe
    repo.registerRef(1, "technicien", 999);
    const i = await creerIntervention(repo, A, base({ technicienId: 999 }));
    expect(i.technicienId).toBe(999);
  });

  it("modifierIntervention OK ; technicienId hors tenant → NotFound (anti-IDOR-FK)", async () => {
    const repo = repoAvecClientA();
    const i = await creerIntervention(repo, A, base());
    const maj = await modifierIntervention(repo, A, i.id, { titre: "Modifié" });
    expect(maj.titre).toBe("Modifié");
    await expect(modifierIntervention(repo, A, i.id, { technicienId: 777 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("modifierIntervention : intervention d'un autre tenant → NotFound", async () => {
    const repo = repoAvecClientA();
    const i = await creerIntervention(repo, A, base());
    await expect(modifierIntervention(repo, B, i.id, { titre: "hack" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("garde de transition : planifiee → en_cours OK ; planifiee → terminee refusé", async () => {
    const repo = repoAvecClientA();
    const i = await creerIntervention(repo, A, base());
    expect(i.statut).toBe("planifiee");
    const enCours = await modifierIntervention(repo, A, i.id, { statut: "en_cours" });
    expect(enCours.statut).toBe("en_cours");
    await expect(modifierIntervention(repo, A, i.id, { statut: "planifiee" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("garde de transition : en_cours → terminee OK (avec technicien) ; en_cours → planifiee refusé", async () => {
    const repo = repoAvecClientA();
    repo.registerRef(1, "technicien", 42);
    const i = await creerIntervention(repo, A, base({ statut: "en_cours", technicienId: 42 }));
    const terminee = await modifierIntervention(repo, A, i.id, { statut: "terminee" });
    expect(terminee.statut).toBe("terminee");
    expect(terminee.dateFin).toBeInstanceOf(Date);
    await expect(modifierIntervention(repo, A, i.id, { statut: "en_cours" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("terminer sans technicienId → ValidationError", async () => {
    const repo = repoAvecClientA();
    const i = await creerIntervention(repo, A, base({ statut: "en_cours" }));
    await expect(modifierIntervention(repo, A, i.id, { statut: "terminee" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("terminer : technicienId fourni dans l'input suffit même si absent sur l'intervention", async () => {
    const repo = repoAvecClientA();
    repo.registerRef(1, "technicien", 55);
    const i = await creerIntervention(repo, A, base({ statut: "en_cours" }));
    const terminee = await modifierIntervention(repo, A, i.id, { statut: "terminee", technicienId: 55 });
    expect(terminee.statut).toBe("terminee");
    expect(terminee.technicienId).toBe(55);
  });

  it("terminer : dateFin explicite fourni dans l'input → conservé (pas d'écrasement auto)", async () => {
    const repo = repoAvecClientA();
    repo.registerRef(1, "technicien", 42);
    const dateFin = new Date("2026-06-15T16:00:00Z");
    const i = await creerIntervention(repo, A, base({ statut: "en_cours", technicienId: 42 }));
    const terminee = await modifierIntervention(repo, A, i.id, { statut: "terminee", dateFin });
    expect(terminee.dateFin).toEqual(dateFin);
  });

  it("garde de transition : états terminaux (terminee, annulee) → tout refusé", async () => {
    const repo = repoAvecClientA();
    const t = await creerIntervention(repo, A, base({ statut: "terminee" }));
    await expect(modifierIntervention(repo, A, t.id, { statut: "planifiee" })).rejects.toBeInstanceOf(ValidationError);
    await expect(modifierIntervention(repo, A, t.id, { statut: "annulee" })).rejects.toBeInstanceOf(ValidationError);
    const ann = await creerIntervention(repo, A, base({ statut: "annulee" }));
    await expect(modifierIntervention(repo, A, ann.id, { statut: "planifiee" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("garde de transition : même statut → idempotent (pas d'erreur)", async () => {
    const repo = repoAvecClientA();
    const i = await creerIntervention(repo, A, base());
    const r = await modifierIntervention(repo, A, i.id, { statut: "planifiee" });
    expect(r.statut).toBe("planifiee");
  });

  it("garde de transition : pas de statut dans l'input → pas de vérification", async () => {
    const repo = repoAvecClientA();
    const i = await creerIntervention(repo, A, base({ statut: "terminee" }));
    const r = await modifierIntervention(repo, A, i.id, { titre: "Nouveau titre" });
    expect(r.statut).toBe("terminee");
  });

  it("supprimerIntervention OK / cross-tenant → NotFound", async () => {
    const repo = repoAvecClientA();
    const i = await creerIntervention(repo, A, base());
    await expect(supprimerIntervention(repo, B, i.id)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerIntervention(repo, A, i.id);
    await expect(supprimerIntervention(repo, A, i.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
