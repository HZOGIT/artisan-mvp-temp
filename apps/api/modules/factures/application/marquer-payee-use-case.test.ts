import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { FakeNotificationRepository } from "../../notifications/infra/notification-repository-fake";
import { creerFacture, ajouterLigneFacture, changerStatutFacture, marquerFacturePayee, enregistrerPaiementFacture } from "./write-use-cases";
import type { ComptaPort } from "./compta-port";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const fakeArtisanReader = { getArtisan: async () => ({ id: 1, nomEntreprise: null, email: null, siret: "73282932000074" }) };

/** Espionne le ComptaPort : capture les appels (ordre/ids) ; option d'échec pour tester la propagation. */
class SpyComptaPort implements ComptaPort {
  readonly calls: string[] = [];
  constructor(private readonly fail = false) {}
  async genererEcrituresVente(_ctx: TenantContext, factureId: number): Promise<void> {
    this.calls.push(`vente:${factureId}`);
    if (this.fail) throw new Error("compta KO");
  }
  async genererEcrituresEncaissement(_ctx: TenantContext, factureId: number): Promise<void> {
    this.calls.push(`encaissement:${factureId}`);
    if (this.fail) throw new Error("compta KO");
  }
  async validerEcritures(_ctx: TenantContext, factureId: number): Promise<void> {
    this.calls.push(`valider:${factureId}`);
    if (this.fail) throw new Error("compta KO");
  }
}

async function factureEmise(repo: FakeFactureRepository): Promise<number> {
  const f = await creerFacture(repo, A, { clientId: 100 });
  await ajouterLigneFacture(repo, A, f.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
  await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);
  return f.id;
}

describe("factures — marquerFacturePayee (markAsPaid + FEC)", () => {
  it("force statut=payee, écrase montantPaye, génère vente + encaissement + validerEcritures (dans l'ordre)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const compta = new SpyComptaPort();
    const f = await marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-03-10" }, compta);
    expect(f.statut).toBe("payee");
    expect(f.montantPaye).toBe("120.00");
    expect(compta.calls).toEqual([`vente:${id}`, `encaissement:${id}`, `valider:${id}`]);
  });

  it("date de paiement invalide → ValidationError AVANT toute écriture (aucun appel compta)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const compta = new SpyComptaPort();
    await expect(marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "pas-une-date" }, compta)).rejects.toBeInstanceOf(ValidationError);
    expect(compta.calls).toEqual([]);
  });

  it("facture d'un autre tenant → NotFoundError (anti-IDOR)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    await expect(marquerFacturePayee(repo, B, id, { montantPaye: "120.00", datePaiement: "2026-03-10" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("échec compta best-effort : paiement déjà committé reste accessible, pas d'exception", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const compta = new SpyComptaPort(true);
    const f = await marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-03-10" }, compta);
    expect(f.statut).toBe("payee");
    expect(compta.calls).toContain(`vente:${id}`);
  });

  it("brouillon → ConflictError (garde statut source)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    await expect(
      marquerFacturePayee(repo, A, f.id, { montantPaye: "100.00", datePaiement: "2026-03-10" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("payee → ConflictError (statut terminal)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    await marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-03-10" });
    await expect(
      marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-03-10" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("annulee → ConflictError (statut terminal)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    await repo.setStatut(A, f.id, "annulee");
    await expect(
      marquerFacturePayee(repo, A, f.id, { montantPaye: "0.00", datePaiement: "2026-03-10" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("crée un reglement traçant la source de paiement (anti-régression OPE-982)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    await marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-03-10" });
    const reglements = repo.getReglementsForTest(id);
    expect(reglements).toHaveLength(1);
    expect(reglements[0].montant).toBe("120.00");
    expect(reglements[0].date).toEqual(new Date("2026-03-10"));
  });
});

describe("factures — archivage notification rappel à la mise en payée (OPE-795)", () => {
  it("marquerFacturePayee : notification rappel archivée après paiement", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const notifRepo = new FakeNotificationRepository();
    notifRepo.seed({ artisanId: A.artisanId, titre: "Rappel retard", type: "rappel", lien: `/factures/${id}` });
    await marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-03-10" }, undefined, notifRepo);
    const actives = await notifRepo.list(A, { includeArchived: false });
    expect(actives.find((n) => n.lien === `/factures/${id}` && n.type === "rappel")).toBeUndefined();
  });

  it("enregistrerPaiementFacture soldée : notification rappel archivée", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    await ajouterLigneFacture(repo, A, f.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, { getArtisan: async () => ({ id: 1, nomEntreprise: null, email: null, siret: "73282932000074" }) });
    const notifRepo = new FakeNotificationRepository();
    notifRepo.seed({ artisanId: A.artisanId, titre: "Rappel retard", type: "rappel", lien: `/factures/${f.id}` });
    await enregistrerPaiementFacture(repo, A, f.id, { montant: "120.00" }, undefined, notifRepo);
    const actives = await notifRepo.list(A, { includeArchived: false });
    expect(actives.find((n) => n.lien === `/factures/${f.id}` && n.type === "rappel")).toBeUndefined();
  });

  it("paiement partiel (non soldé) : notification rappel NON archivée", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    await ajouterLigneFacture(repo, A, f.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, { getArtisan: async () => ({ id: 1, nomEntreprise: null, email: null, siret: "73282932000074" }) });
    const notifRepo = new FakeNotificationRepository();
    notifRepo.seed({ artisanId: A.artisanId, titre: "Rappel retard", type: "rappel", lien: `/factures/${f.id}` });
    await enregistrerPaiementFacture(repo, A, f.id, { montant: "50.00" }, undefined, notifRepo);
    const actives = await notifRepo.list(A, { includeArchived: false });
    expect(actives.find((n) => n.lien === `/factures/${f.id}` && n.type === "rappel")).toBeDefined();
  });

  it("notification d'un autre tenant non archivée (isolation)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const notifRepo = new FakeNotificationRepository();
    notifRepo.seed({ artisanId: B.artisanId, titre: "Rappel autre", type: "rappel", lien: `/factures/${id}` });
    await marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-03-10" }, undefined, notifRepo);
    const actives = await notifRepo.list(B, { includeArchived: false });
    expect(actives.find((n) => n.lien === `/factures/${id}`)).toBeDefined();
  });
});
