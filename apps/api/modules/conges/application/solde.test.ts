import { describe, it, expect } from "vitest";
import { calculerJoursConge, typeAffecteSolde } from "./solde";
import { FakeCongeRepository } from "../infra/conge-repository-fake";
import { creerConge, approuverConge, annulerConge, supprimerConge } from "./write-use-cases";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const TECH = 500;

describe("calculerJoursConge (jours ouvrés, sam/dim exclus)", () => {
  it("jours ouvrés pleins — lun→ven = 5 jours, même jour ouvré = 1", () => {
    /* 2026-07-06 (lun) → 2026-07-10 (ven) = 5 jours ouvrés */
    expect(calculerJoursConge({ dateDebut: "2026-07-06", dateFin: "2026-07-10", demiJourneeDebut: false, demiJourneeFin: false }).jours).toBe(5);
    expect(calculerJoursConge({ dateDebut: "2026-07-06", dateFin: "2026-07-06", demiJourneeDebut: false, demiJourneeFin: false }).jours).toBe(1);
  });

  it("weekends exclus — mer→dim = 3 jours ouvrés (mer/jeu/ven)", () => {
    /* 2026-07-01 (mer) → 2026-07-05 (dim) : sam+dim exclus → 3 jours */
    expect(calculerJoursConge({ dateDebut: "2026-07-01", dateFin: "2026-07-05", demiJourneeDebut: false, demiJourneeFin: false }).jours).toBe(3);
  });

  it("demi-journées retranchent 0,5 chacune", () => {
    expect(calculerJoursConge({ dateDebut: "2026-07-06", dateFin: "2026-07-10", demiJourneeDebut: true, demiJourneeFin: true }).jours).toBe(4);
    expect(calculerJoursConge({ dateDebut: "2026-07-06", dateFin: "2026-07-06", demiJourneeDebut: true, demiJourneeFin: false }).jours).toBe(0.5);
  });

  it("année d'imputation = année de dateDebut (anti-corruption inter-exercices)", () => {
    expect(calculerJoursConge({ dateDebut: "2026-12-31", dateFin: "2027-01-02", demiJourneeDebut: false, demiJourneeFin: false }).annee).toBe(2026);
  });

  it("jours fériés exclus — 25 dec (féié) exclut, donc tar 22 dec→sam 26 dec = 3 jours", () => {
    /* 2026-12-22 (tar) → 2026-12-26 (sam, exclu) = tar/mer/jeu (25 dec féié) = 3 jours */
    expect(calculerJoursConge({ dateDebut: "2026-12-22", dateFin: "2026-12-26", demiJourneeDebut: false, demiJourneeFin: false }).jours).toBe(3);
  });

  it("jours fériés mobiles exclus — Lundi de Pâques 2025 (21 avril) exclut dans congé 21-23 avril", () => {
    /* 2025-04-21 (Lun Pâques) → 2025-04-23 (mer) : Lun de Pâques féié → jeu 22 + 23 = 2 jours (pas 3) */
    expect(calculerJoursConge({ dateDebut: "2025-04-21", dateFin: "2025-04-23", demiJourneeDebut: false, demiJourneeFin: false }).jours).toBe(2);
  });

  it("typeAffecteSolde : conge_paye/rtt oui, autres non", () => {
    expect(typeAffecteSolde("conge_paye")).toBe(true);
    expect(typeAffecteSolde("rtt")).toBe(true);
    for (const t of ["maladie", "sans_solde", "formation", "autre"]) expect(typeAffecteSolde(t)).toBe(false);
  });
});

describe("conges — intégration solde (décompte idempotent + recrédit)", () => {
  function seed() {
    const repo = new FakeCongeRepository();
    repo.registerTechnicien(1, TECH);
    return repo;
  }
  const conge = (over = {}) => ({ technicienId: TECH, type: "conge_paye" as const, dateDebut: "2026-07-06", dateFin: "2026-07-10", ...over });

  it("approuver décompte le solde (5 jours) ; ré-approuver ne re-décompte pas (idempotent)", async () => {
    const repo = seed();
    const c = await creerConge(repo, A, conge());
    await approuverConge(repo, A, c.id);
    expect(repo.getJoursPris(1, TECH, "conge_paye", 2026)).toBe(5);
    await approuverConge(repo, A, c.id); // idempotent
    expect(repo.getJoursPris(1, TECH, "conge_paye", 2026)).toBe(5);
  });

  it("annuler un congé approuvé recrédite ; annuler 2× ne re-recrédite pas", async () => {
    const repo = seed();
    const c = await creerConge(repo, A, conge());
    await approuverConge(repo, A, c.id);
    await annulerConge(repo, A, c.id);
    expect(repo.getJoursPris(1, TECH, "conge_paye", 2026)).toBe(0); // recrédité
    await annulerConge(repo, A, c.id); // idempotent
    expect(repo.getJoursPris(1, TECH, "conge_paye", 2026)).toBe(0);
  });

  it("supprimer un congé approuvé recrédite le solde (parité legacy)", async () => {
    const repo = seed();
    const c = await creerConge(repo, A, conge());
    await approuverConge(repo, A, c.id);
    expect(repo.getJoursPris(1, TECH, "conge_paye", 2026)).toBe(5);
    await supprimerConge(repo, A, c.id);
    expect(repo.getJoursPris(1, TECH, "conge_paye", 2026)).toBe(0);
  });

  it("annuler une demande NON approuvée (en_attente) ne touche pas le solde", async () => {
    const repo = seed();
    const c = await creerConge(repo, A, conge());
    await annulerConge(repo, A, c.id);
    expect(repo.getJoursPris(1, TECH, "conge_paye", 2026)).toBe(0);
  });

  it("un type sans impact solde (maladie) n'écrit jamais dans le solde", async () => {
    const repo = seed();
    const c = await creerConge(repo, A, conge({ type: "maladie" }));
    await approuverConge(repo, A, c.id);
    expect(repo.getJoursPris(1, TECH, "maladie", 2026)).toBe(0);
    expect(repo.getJoursPris(1, TECH, "conge_paye", 2026)).toBe(0);
  });
});
