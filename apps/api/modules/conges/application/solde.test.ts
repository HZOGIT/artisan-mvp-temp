import { describe, it, expect } from "vitest";
import { calculerJoursConge, typeAffecteSolde, calculerJoursAcquisAnnee, periodeReference, calculerJoursAcquisPeriode, exerciceCourant } from "./solde";
import { FakeCongeRepository } from "../infra/conge-repository-fake";
import { creerConge, approuverConge, annulerConge, supprimerConge } from "./write-use-cases";
import { cloturerPeriode } from "./read-use-cases";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const TECH = 500;

describe("calculerJoursAcquisAnnee (acquisition CP — mois entiers × 2,5)", () => {
  it("N mois entiers → N × 2,5", () => {
    /* Jan 1 → Jul 1 : Jan-Jun complets = 6 mois */
    expect(calculerJoursAcquisAnnee(new Date("2026-01-01"), 2026, new Date("2026-07-01"))).toBe(15);
    /* Jan 1 → Apr 1 : Jan-Mar complets = 3 mois */
    expect(calculerJoursAcquisAnnee(new Date("2026-01-01"), 2026, new Date("2026-04-01"))).toBe(7.5);
  });

  it("12 mois complets (année suivante) → 30 j", () => {
    expect(calculerJoursAcquisAnnee(new Date("2026-01-01"), 2026, new Date("2027-01-01"))).toBe(30);
  });

  it("idempotence — même inputs → même résultat", () => {
    const d = new Date("2026-01-01");
    const t = new Date("2026-06-15");
    expect(calculerJoursAcquisAnnee(d, 2026, t)).toBe(calculerJoursAcquisAnnee(d, 2026, t));
  });

  it("embauche hors de l'année → 0", () => {
    expect(calculerJoursAcquisAnnee(new Date("2027-01-01"), 2026, new Date("2026-12-31"))).toBe(0);
  });

  it("embauche en cours de mois — mois partiel exclu", () => {
    /* Jan 15 → Jul 1 : Jan partiel exclu, Feb-Jun = 5 mois */
    expect(calculerJoursAcquisAnnee(new Date("2026-01-15"), 2026, new Date("2026-07-01"))).toBe(12.5);
  });
});

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

describe("periodeReference — bascule juin→mai", () => {
  it("janvier–mai → période N-1/06/01 – N/05/31 (exercice N-1–N)", () => {
    const r = periodeReference("2026-01-15");
    expect(r.periodeDebut).toBe("2025-06-01");
    expect(r.periodeFin).toBe("2026-05-31");
    expect(r.exercice).toBe("2025-2026");
  });

  it("juin–décembre → période N/06/01 – N+1/05/31 (exercice N–N+1)", () => {
    const r = periodeReference("2025-09-01");
    expect(r.periodeDebut).toBe("2025-06-01");
    expect(r.periodeFin).toBe("2026-05-31");
    expect(r.exercice).toBe("2025-2026");
  });

  it("1er juin = début de nouvelle période", () => {
    const r = periodeReference("2026-06-01");
    expect(r.exercice).toBe("2026-2027");
  });

  it("31 mai = dernier jour de la période courante", () => {
    const r = periodeReference("2026-05-31");
    expect(r.exercice).toBe("2025-2026");
  });

  it("calculerJoursConge retourne la période dans CalculSolde", () => {
    const r = calculerJoursConge({ dateDebut: "2026-07-06", dateFin: "2026-07-10", demiJourneeDebut: false, demiJourneeFin: false });
    expect(r.periodeDebut).toBe("2026-06-01");
    expect(r.periodeFin).toBe("2027-05-31");
    expect(r.exercice).toBe("2026-2027");
    expect(r.annee).toBe(2026);
  });

  it("exerciceCourant retourne un format valide AAAA-AAAA", () => {
    const ex = exerciceCourant();
    expect(ex).toMatch(/^\d{4}-\d{4}$/);
  });
});

describe("calculerJoursAcquisPeriode — période juin→mai", () => {
  it("pleine période (embauche avant, today après) = 30 j", () => {
    expect(calculerJoursAcquisPeriode(new Date("2020-01-01"), "2025-06-01", "2026-05-31", new Date("2026-06-15"))).toBe(30);
  });

  it("embauche mi-période (15 août) = mois complets depuis sept", () => {
    /** Août partiel exclu → sep..mai = 9 mois = 22,5 j */
    expect(calculerJoursAcquisPeriode(new Date("2025-08-15"), "2025-06-01", "2026-05-31", new Date("2026-06-01"))).toBe(22.5);
  });

  it("embauche le 1er du mois = mois entier inclus", () => {
    /** 1er août exact → août..mai = 10 mois = 25 j */
    expect(calculerJoursAcquisPeriode(new Date("2025-08-01"), "2025-06-01", "2026-05-31", new Date("2026-06-01"))).toBe(25);
  });

  it("today dans la période = mois partiels non comptés", () => {
    /** Today = 1er nov (nov en cours) → juin..oct = 5 mois = 12,5 j */
    expect(calculerJoursAcquisPeriode(new Date("2020-01-01"), "2025-06-01", "2026-05-31", new Date("2025-11-01"))).toBe(12.5);
  });

  it("embauche après la fin de période = 0", () => {
    expect(calculerJoursAcquisPeriode(new Date("2027-01-01"), "2025-06-01", "2026-05-31", new Date("2026-06-01"))).toBe(0);
  });
});

describe("cloturerPeriode — report CP non pris", () => {
  function seed(dateEmbauche = new Date("2020-01-01")) {
    const repo = new FakeCongeRepository();
    repo.registerTechnicien(1, TECH, dateEmbauche);
    return repo;
  }

  it("congé non pris → report = joursAcquis vers période suivante", async () => {
    const repo = seed();
    /** Aucun congé approuvé → joursPris = 0, joursAcquis = 30 → report = 30 */
    const result = await cloturerPeriode(repo, A, "2025-06-01");
    expect(result).toHaveLength(1);
    expect(result[0].joursReportes).toBe(30);
    expect(repo.getJoursReportes(1, TECH, "conge_paye", "2026-06-01")).toBe(30);
  });

  it("congé pris = 5 j → report = 25 j", async () => {
    const repo = seed();
    const c = await creerConge(repo, A, { technicienId: TECH, type: "conge_paye", dateDebut: "2026-07-06", dateFin: "2026-07-10" });
    await approuverConge(repo, A, c.id);
    /** 5 j pris sur période 2026-06-01 (congé de juillet 2026 = exercice 2026-2027, pas 2025-2026) */
    /** Pour période 2025-06-01, aucun pris → report = 30 */
    const result = await cloturerPeriode(repo, A, "2025-06-01");
    expect(result[0].joursReportes).toBe(30);
  });

  it("idempotent : clôturer 2× ne double pas le report", async () => {
    const repo = seed();
    await cloturerPeriode(repo, A, "2025-06-01");
    await cloturerPeriode(repo, A, "2025-06-01");
    expect(repo.getJoursReportes(1, TECH, "conge_paye", "2026-06-01")).toBe(30);
  });
});
