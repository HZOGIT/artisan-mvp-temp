import { describe, it, expect } from "vitest";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import { FacturesContratFactureGenerator } from "../infra/factures-contrat-facture-generator";
import { FakeFactureRepository } from "../../factures/infra/facture-repository-fake";
import { FakeArtisanRepository } from "../../artisan/infra/artisan-repository-fake";
import {
  listContratsAFacturer,
  getInterventionsContrat,
  creerInterventionContrat,
  modifierInterventionContrat,
  genererFactureContrat,
  addMonthsClamped,
} from "./interventions-use-cases";
import { NotFoundError, ConflictError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({
  clientId: 100,
  titre: "Entretien",
  montantHT: "300.00",
  periodicite: "annuel" as const,
  dateDebut: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("contrats — interventions & à-facturer use-cases", () => {
  it("getInterventionsContrat : liste si contrat possédé, NotFound sinon", async () => {
    const repo = new FakeContratRepository();
    const c = await repo.create(A, base(), "CTR-00001");
    await creerInterventionContrat(repo, A, { contratId: c.id, titre: "Visite 1", dateIntervention: new Date("2026-02-01") });
    expect(await getInterventionsContrat(repo, A, c.id)).toHaveLength(1);
    await expectCrossTenantDenied(() => getInterventionsContrat(repo, B, c.id));
    await expect(getInterventionsContrat(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creerInterventionContrat : statut 'planifiee' forcé + artisanId du tenant ; 404 si contrat hors tenant", async () => {
    const repo = new FakeContratRepository();
    const c = await repo.create(A, base(), "CTR-00001");
    const i = await creerInterventionContrat(repo, A, { contratId: c.id, titre: "Visite", dateIntervention: new Date("2026-02-01") });
    expect(i.statut).toBe("planifiee");
    expect(i.artisanId).toBe(A.artisanId);
    await expect(
      creerInterventionContrat(repo, B, { contratId: c.id, titre: "X", dateIntervention: new Date("2026-02-01") }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("modifierInterventionContrat : anti-IDOR id↔contrat (intervention d'un autre contrat → 404)", async () => {
    const repo = new FakeContratRepository();
    const c1 = await repo.create(A, base(), "CTR-00001");
    const c2 = await repo.create(A, base({ titre: "Autre" }), "CTR-00002");
    const i = await creerInterventionContrat(repo, A, { contratId: c1.id, titre: "Visite", dateIntervention: new Date("2026-02-01") });
    // bon contrat → OK
    const updated = await modifierInterventionContrat(repo, A, i.id, c1.id, { statut: "effectuee", rapport: "RAS" });
    expect(updated.statut).toBe("effectuee");
    expect(updated.rapport).toBe("RAS");
    // id d'intervention de c1 mais déclaré sous c2 → 404 (découplage refusé)
    await expect(modifierInterventionContrat(repo, A, i.id, c2.id, { statut: "annulee" })).rejects.toBeInstanceOf(NotFoundError);
    // intervention vue depuis un autre tenant → 404
    await expect(modifierInterventionContrat(repo, B, i.id, c1.id, { statut: "annulee" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listContratsAFacturer : seulement actifs échus, TTC dérivé + jours de retard + nom client", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(A.artisanId, 100, "Dupont");
    // échu (hier) : doit apparaître
    const echu = await repo.create(
      A,
      base({ clientId: 100, montantHT: "100.00", tauxTVA: "20.00", prochainFacturation: new Date("2026-06-13T00:00:00Z") }),
      "CTR-00001",
    );
    // futur : ne doit PAS apparaître
    await repo.create(A, base({ clientId: 100, prochainFacturation: new Date("2030-01-01") }), "CTR-00002");
    // suspendu échu : ne doit PAS apparaître
    const susp = await repo.create(A, base({ clientId: 100, prochainFacturation: new Date("2026-06-13") }), "CTR-00003");
    await repo.setStatut(A, susp.id, "suspendu");

    const out = await listContratsAFacturer(repo, A, () => new Date("2026-06-14T12:00:00Z"));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(echu.id);
    expect(out[0].montantTTC).toBe("120.00"); // 100 × 1.20
    expect(out[0].clientNom).toBe("Dupont");
    expect(out[0].joursRetard).toBe(1);
    // isolation : B ne voit rien
    expect(await listContratsAFacturer(repo, B)).toEqual([]);
  });

  it("listContratsAFacturer : arrondi TVA correct sur montant à centimes (HT=100.10, TVA=20%)", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(A.artisanId, 200, "Precision");
    await repo.create(
      A,
      base({ clientId: 200, montantHT: "100.10", tauxTVA: "20.00", prochainFacturation: new Date("2026-06-13T00:00:00Z") }),
      "CTR-PREC",
    );
    const out = await listContratsAFacturer(repo, A, () => new Date("2026-06-14T12:00:00Z"));
    expect(out[0].montantTVA).toBe("20.02");
    expect(out[0].montantTTC).toBe("120.12");
  });

  it("addMonthsClamped : clamp de fin de mois (31 jan + 1 mois → 28 fév)", () => {
    expect(addMonthsClamped(new Date("2026-01-31T00:00:00Z"), 1).getDate()).toBe(28);
    expect(addMonthsClamped(new Date("2026-03-15T00:00:00Z"), 3).getMonth()).toBe(5); // juin
  });

  it("genererFactureContrat : facture émise (sans FEC) + récurrente + prochainFacturation avancée", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(A.artisanId, 100, "Durand");
    const c = await repo.create(
      A,
      base({ clientId: 100, montantHT: "200.00", tauxTVA: "20.00", periodicite: "mensuel" }),
      "CTR-00001",
    );
    // Adapter réel branché sur le repo factures (fake) : compose les use-cases factures.
    const factureRepo = new FakeFactureRepository();
    factureRepo.registerClient(A.artisanId, 100); // anti-IDOR de creerFacture
    const gen = new FacturesContratFactureGenerator(factureRepo);

    const now = new Date("2026-06-14T10:00:00Z");
    const ref = await genererFactureContrat(repo, gen, A, c.id, () => now);

    // Facture créée, émise, avec totaux dérivés de la ligne (HT 200 / TTC 240) — SANS écriture FEC.
    const facture = await factureRepo.getById(A, ref.id);
    expect(facture?.statut).toBe("envoyee");
    expect(facture?.totalHT).toBe("200.00");
    expect(facture?.totalTTC).toBe("240.00");
    expect((await factureRepo.listLignes(A, ref.id))).toHaveLength(1);
    // Facture récurrente enregistrée (mensuel → periodeFin = +1 mois).
    expect(repo.facturesRecurrentes).toHaveLength(1);
    expect(repo.facturesRecurrentes[0].factureId).toBe(ref.id);
    expect(repo.facturesRecurrentes[0].periodeFin.getMonth()).toBe(6); // juillet (juin + 1)
    // prochainFacturation avancée à la fin de période.
    expect((await repo.getById(A, c.id))?.prochainFacturation?.getMonth()).toBe(6);
  });

  it("genererFactureContrat : 2e appel avant l'échéance → ConflictError (anti double facturation)", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(A.artisanId, 100, "Durand");
    const c = await repo.create(
      A,
      base({ clientId: 100, montantHT: "200.00", tauxTVA: "20.00", periodicite: "mensuel" }),
      "CTR-00001",
    );
    const factureRepo = new FakeFactureRepository();
    factureRepo.registerClient(A.artisanId, 100);
    const gen = new FacturesContratFactureGenerator(factureRepo);
    const now = new Date("2026-06-14T10:00:00Z");
    // 1er appel OK → prochainFacturation avancée à juillet.
    await genererFactureContrat(repo, gen, A, c.id, () => now);
    // 2e appel (double-clic / retry) à la MÊME date → refusé (échéance juillet non atteinte).
    await expect(genererFactureContrat(repo, gen, A, c.id, () => now)).rejects.toBeInstanceOf(ConflictError);
    // Pas de 2e facture récurrente → pas de double facturation.
    expect(repo.facturesRecurrentes).toHaveLength(1);
  });

  it("genererFactureContrat : 404 si le contrat n'appartient pas au tenant", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(A.artisanId, 100);
    const c = await repo.create(A, base({ clientId: 100 }), "CTR-00001");
    const gen = new FacturesContratFactureGenerator(new FakeFactureRepository());
    await expect(genererFactureContrat(repo, gen, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("genererFactureContrat : franchise TVA (tauxTVA=0) → tvaCategorieId=FR_FRANCHISE, pas FR_EXONERE", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(A.artisanId, 100, "Franchise");
    const c = await repo.create(
      A,
      base({ clientId: 100, montantHT: "150.00", tauxTVA: "0.00", periodicite: "mensuel" }),
      "CTR-00001",
    );
    const factureRepo = new FakeFactureRepository();
    factureRepo.registerClient(A.artisanId, 100);
    const gen = new FacturesContratFactureGenerator(factureRepo);
    const artisanRepo = new FakeArtisanRepository();
    artisanRepo.seed({ id: A.artisanId, franchiseTVA: true });

    const ref = await genererFactureContrat(repo, gen, A, c.id, () => new Date(), artisanRepo);

    const lignes = await factureRepo.listLignes(A, ref.id);
    expect(lignes[0].tvaCategorieId).toBe("FR_FRANCHISE");
  });
});
