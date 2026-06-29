import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { FakeDevisReader } from "../infra/devis-reader-fake";
import { FakeStockRepository } from "../../stocks/infra/stock-repository-fake";
import {
  creerFacture,
  modifierFacture,
  supprimerFacture,
  ajouterLigneFacture,
  modifierLigneFacture,
  supprimerLigneFacture,
  changerStatutFacture,
  enregistrerPaiementFacture,
  ajouterReglement,
  creerAvoir,
  calculerMontantSituation,
  facturerSituation,
  facturerAcompte,
  facturerSolde,
} from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { DevisReadModel } from "./devis-reader";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const fakeArtisanReader = { getArtisan: async () => ({ id: 1, nomEntreprise: null, email: null, siret: "73282932000074" }) };

function repoWithClient(ctx: TenantContext, cid: number): FakeFactureRepository {
  const repo = new FakeFactureRepository();
  repo.registerClient(ctx.artisanId, cid);
  return repo;
}

describe("factures — use-cases d'écriture", () => {
  it("creerFacture avec lignes — atomique : crash dans createWithLignes ne laisse pas de header orphelin", async () => {
    class CrashOnCreateWithLignes extends FakeFactureRepository {
      override createWithLignes(): Promise<never> {
        throw new Error("crash simulé insert ligne");
      }
    }
    const repo = new CrashOnCreateWithLignes();
    repo.registerClient(A.artisanId, 100);
    await expect(creerFacture(repo, A, { clientId: 100, lignes: [{ designation: "L", prixUnitaireHT: "50.00" }] })).rejects.toThrow("crash simulé insert ligne");
    expect(await repo.list(A)).toHaveLength(0);
  });

  it("creerFacture avec lignes — totaux recalculés, lignes visibles, brouillon sans numéro", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, {
      clientId: 100,
      lignes: [
        { designation: "Main d'œuvre", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" },
        { designation: "Matériaux", quantite: "1", prixUnitaireHT: "50.00", tauxTVA: "20" },
      ],
    });
    expect(f.numero).toBeNull();
    expect(f.totalTTC).toBe("300.00");
    expect(await repo.listLignes(A, f.id)).toHaveLength(2);
  });

  it("creerFacture — brouillon sans numéro ; numéro assigné à l'émission (changerStatut envoyee)", async () => {
    const repo = repoWithClient(A, 100);
    const f1 = await creerFacture(repo, A, { clientId: 100, objet: "Travaux" });
    const f2 = await creerFacture(repo, A, { clientId: 100 });
    expect(f1.numero).toBeNull();
    expect(f2.numero).toBeNull();
    expect(f1.statut).toBe("brouillon");
    const emise = await changerStatutFacture(repo, A, f1.id, "envoyee", undefined, fakeArtisanReader);
    expect(emise.numero).toBe("FAC-00001");
    expect(emise.statut).toBe("envoyee");
  });

  it("creerFacture — clientId hors tenant → NotFound (anti-IDOR-FK)", async () => {
    const repo = repoWithClient(B, 77);
    await expectCrossTenantDenied(() => creerFacture(repo, A, { clientId: 77 }));
    await expect(creerFacture(repo, A, { clientId: 77 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creerFacture — devisId hors tenant → NotFound ; devisId du tenant → OK", async () => {
    const repo = repoWithClient(A, 100);
    repo.registerDevis(B.artisanId, 55); // devis 55 appartient à B
    await expect(creerFacture(repo, A, { clientId: 100, devisId: 55 })).rejects.toBeInstanceOf(NotFoundError);
    repo.registerDevis(A.artisanId, 9);
    expect((await creerFacture(repo, A, { clientId: 100, devisId: 9 })).devisId).toBe(9);
  });

  it("modifierFacture — brouillon OK ; cross-tenant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100, objet: "Avant" });
    expect((await modifierFacture(repo, A, f.id, { objet: "Après" })).objet).toBe("Après");
    await expectCrossTenantDenied(() => modifierFacture(repo, B, f.id, { objet: "hack" }));
  });

  it("IMMUTABILITÉ post-émission : facture non-brouillon → modifier/supprimer Conflict", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    repo.setStatutForTest(f.id, "validee");
    await expect(modifierFacture(repo, A, f.id, { objet: "x" })).rejects.toBeInstanceOf(ConflictError);
    await expect(supprimerFacture(repo, A, f.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("supprimerFacture — brouillon OK ; inexistant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    await supprimerFacture(repo, A, f.id);
    expect(await repo.list(A)).toEqual([]);
    await expect(supprimerFacture(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("garde verrouillage — creerFacture avec lockDate future/passée → refus si aujourd'hui ≤ lockDate", async () => {
    const repo = repoWithClient(A, 100);
    const futurLockDate = "2099-12-31"; /* toujours dans le futur → today ≤ lock → refuse */
    await expect(creerFacture(repo, A, { clientId: 100 }, undefined, futurLockDate)).rejects.toBeInstanceOf(ValidationError);
    await expect(creerFacture(repo, A, { clientId: 100 }, undefined, null)).resolves.toBeDefined();
  });

  it("garde verrouillage — modifierFacture refuse si dateFacture ≤ lockDate, autorise sinon", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    /* brouillon : dateFacture = null → coerced to today ; lockDate passée → OK */
    await expect(modifierFacture(repo, A, f.id, { objet: "X" }, "2000-01-01")).resolves.toBeDefined();
    /* lockDate dans le futur → today ≤ lock → refuse */
    await expect(modifierFacture(repo, A, f.id, { objet: "Y" }, "2099-12-31")).rejects.toBeInstanceOf(ValidationError);
  });

  it("ajouterLigneFacture — recalcule les totaux ; designation vide → Validation ; prix négatif → Validation", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    const l = await ajouterLigneFacture(repo, A, f.id, { designation: "Main d'œuvre", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" });
    expect(l.montantTTC).toBe("240.00");
    expect((await repo.getById(A, f.id))?.totalTTC).toBe("240.00");
    await expect(ajouterLigneFacture(repo, A, f.id, { designation: "  ", prixUnitaireHT: "10" })).rejects.toBeInstanceOf(ValidationError);
    await expect(ajouterLigneFacture(repo, A, f.id, { designation: "X", prixUnitaireHT: "-5" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("ajouterLigneFacture — facture d'un autre tenant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    await expect(ajouterLigneFacture(repo, B, f.id, { designation: "Vol", prixUnitaireHT: "1" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("IMMUTABILITÉ lignes : pas d'ajout/modif/suppr de ligne sur une facture non-brouillon → Conflict", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    const l = await ajouterLigneFacture(repo, A, f.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00" });
    repo.setStatutForTest(f.id, "envoyee");
    await expect(ajouterLigneFacture(repo, A, f.id, { designation: "Y", prixUnitaireHT: "1" })).rejects.toBeInstanceOf(ConflictError);
    await expect(modifierLigneFacture(repo, A, f.id, l.id, { quantite: "9" })).rejects.toBeInstanceOf(ConflictError);
    await expect(supprimerLigneFacture(repo, A, f.id, l.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("modifier/supprimer ligne — recalcul totaux ; ligne hors facture → NotFound ; cross-tenant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    const l = await ajouterLigneFacture(repo, A, f.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
    await modifierLigneFacture(repo, A, f.id, l.id, { quantite: "3" });
    expect((await repo.getById(A, f.id))?.totalTTC).toBe("360.00");
    await expect(modifierLigneFacture(repo, A, f.id, 999999, { quantite: "1" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerLigneFacture(repo, B, f.id, l.id)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerLigneFacture(repo, A, f.id, l.id);
    expect((await repo.getById(A, f.id))?.totalTTC).toBe("0.00");
  });

  it("changerStatutFacture — machine à états : brouillon→envoyee→en_retard→payee ; idempotence", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    expect((await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader)).statut).toBe("envoyee");
    expect((await changerStatutFacture(repo, A, f.id, "envoyee")).statut).toBe("envoyee"); // idempotent
    expect((await changerStatutFacture(repo, A, f.id, "en_retard")).statut).toBe("en_retard");
    expect((await changerStatutFacture(repo, A, f.id, "payee")).statut).toBe("payee");
  });

  it("changerStatutFacture — transitions invalides → Conflict ; terminaux figés", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    // brouillon → payee (saute envoyee) interdit
    await expect(changerStatutFacture(repo, A, f.id, "payee")).rejects.toBeInstanceOf(ConflictError);
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);
    await changerStatutFacture(repo, A, f.id, "payee");
    // payee terminal → toute autre transition → Conflict
    await expect(changerStatutFacture(repo, A, f.id, "envoyee")).rejects.toBeInstanceOf(ConflictError);
    await expect(changerStatutFacture(repo, A, f.id, "en_retard")).rejects.toBeInstanceOf(ConflictError);
  });

  it("changerStatutFacture — facture d'un autre tenant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    await expectCrossTenantDenied(() => changerStatutFacture(repo, B, f.id, "envoyee"));
    await expect(changerStatutFacture(repo, B, f.id, "envoyee")).rejects.toBeInstanceOf(NotFoundError);
  });

  // Prépare une facture émise (envoyee) avec une ligne de 120.00 TTC (100 HT @20%).
  async function factureEmise(repo: FakeFactureRepository): Promise<number> {
    const f = await creerFacture(repo, A, { clientId: 100 });
    await ajouterLigneFacture(repo, A, f.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);
    return f.id;
  }

  it("enregistrerPaiement — partiel ne solde pas (statut conservé) ; cumul + soldée → payee", async () => {
    const repo = repoWithClient(A, 100);
    const id = await factureEmise(repo);
    const p1 = await enregistrerPaiementFacture(repo, A, id, { montant: "50.00" });
    expect(p1.montantPaye).toBe("50.00");
    expect(p1.statut).toBe("envoyee");
    const p2 = await enregistrerPaiementFacture(repo, A, id, { montant: "70.00", mode: "virement" });
    expect(p2.montantPaye).toBe("120.00");
    expect(p2.statut).toBe("payee");
    expect(p2.modePaiement).toBe("virement");
  });

  it("enregistrerPaiement — crée un reglement ; invariant Σ(reglements) = montantPaye", async () => {
    const repo = repoWithClient(A, 100);
    const id = await factureEmise(repo);
    await enregistrerPaiementFacture(repo, A, id, { montant: "50.00", mode: "cheque" });
    const r1 = repo.getReglementsForTest(id);
    expect(r1).toHaveLength(1);
    expect(r1[0].montant).toBe("50.00");
    expect(r1[0].mode).toBe("cheque");

    await enregistrerPaiementFacture(repo, A, id, { montant: "70.00" });
    const r2 = repo.getReglementsForTest(id);
    expect(r2).toHaveLength(2);
    const somme = r2.reduce((s, r) => s + Number(r.montant), 0);
    const facture = await repo.getById(A, id);
    expect(somme).toBeCloseTo(Number(facture?.montantPaye), 2);
  });

  it("enregistrerPaiement — sur-paiement → Validation ; montant ≤ 0 → Validation", async () => {
    const repo = repoWithClient(A, 100);
    const id = await factureEmise(repo);
    await expect(enregistrerPaiementFacture(repo, A, id, { montant: "200.00" })).rejects.toBeInstanceOf(ValidationError);
    await expect(enregistrerPaiementFacture(repo, A, id, { montant: "0" })).rejects.toBeInstanceOf(ValidationError);
    await expect(enregistrerPaiementFacture(repo, A, id, { montant: "-10" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("enregistrerPaiement — facture brouillon (non émise) → Conflict ; cross-tenant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100 });
    await ajouterLigneFacture(repo, A, f.id, { designation: "L", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
    await expect(enregistrerPaiementFacture(repo, A, f.id, { montant: "10.00" })).rejects.toBeInstanceOf(ConflictError);
    const id = await factureEmise(repo);
    await expect(enregistrerPaiementFacture(repo, B, id, { montant: "10.00" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creerAvoir — note de crédit à montants négatifs, numéro AV-, liée à l'origine", async () => {
    const repo = repoWithClient(A, 100);
    const id = await factureEmise(repo); // facture émise de 120.00 TTC
    const avoir = await creerAvoir(repo, A, id, { lignes: [{ designation: "Remboursement", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }] });
    expect(avoir.typeDocument).toBe("avoir");
    expect(avoir.numero).toBe("AV-00001");
    expect(avoir.factureOrigineId).toBe(id);
    expect(avoir.statut).toBe("validee");
    expect(avoir.totalHT).toBe("-100.00");
    expect(avoir.totalTTC).toBe("-120.00");
  });

  it("creerAvoir — sur un brouillon → Conflict ; origine d'un autre tenant → NotFound ; sans ligne → Validation", async () => {
    const repo = repoWithClient(A, 100);
    const brouillon = await creerFacture(repo, A, { clientId: 100 });
    await ajouterLigneFacture(repo, A, brouillon.id, { designation: "L", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
    await expect(creerAvoir(repo, A, brouillon.id, { lignes: [{ designation: "x", quantite: "1", prixUnitaireHT: "10" }] })).rejects.toBeInstanceOf(ConflictError);
    const id = await factureEmise(repo);
    await expect(creerAvoir(repo, B, id, { lignes: [{ designation: "x", quantite: "1", prixUnitaireHT: "10" }] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(creerAvoir(repo, A, id, { lignes: [] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerAvoir — anti-sur-avoir : un avoir total puis un second dépassant le solde → Conflict/Validation", async () => {
    const repo = repoWithClient(A, 100);
    const id = await factureEmise(repo); // 120.00 TTC
    // avoir partiel de 60.00 TTC (50 HT @20%)
    await creerAvoir(repo, A, id, { lignes: [{ designation: "Partiel", quantite: "1", prixUnitaireHT: "50.00", tauxTVA: "20" }] });
    // second avoir de 60.00 TTC → solde exactement couvert (OK)
    await creerAvoir(repo, A, id, { lignes: [{ designation: "Solde", quantite: "1", prixUnitaireHT: "50.00", tauxTVA: "20" }] });
    // tout est couvert → un 3e avoir → Conflict (solde épuisé)
    await expect(creerAvoir(repo, A, id, { lignes: [{ designation: "Trop", quantite: "1", prixUnitaireHT: "10.00", tauxTVA: "20" }] })).rejects.toBeInstanceOf(ConflictError);
  });

  it("creerAvoir — un avoir dépassant le total de la facture → Validation", async () => {
    const repo = repoWithClient(A, 100);
    const id = await factureEmise(repo); // 120.00 TTC
    await expect(creerAvoir(repo, A, id, { lignes: [{ designation: "Excessif", quantite: "1", prixUnitaireHT: "200.00", tauxTVA: "20" }] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerAvoir total sur facture remisée — montantHT = prixUnitaireHT × q × (1 - remise/100)", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, {
      clientId: 100,
      lignes: [{ designation: "Produit", prixUnitaireHT: "100.00", quantite: "1", remise: "10", tauxTVA: "20" }],
    });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);
    const avoir = await creerAvoir(repo, A, f.id, {
      lignes: [{ designation: "Produit", prixUnitaireHT: "100.00", quantite: "1", remise: "10", tauxTVA: "20" }],
    });
    /* avoir d'une ligne 100 × 1 × (1-10%) = 90 → montantHT = -90 */
    const lignes = await repo.listLignes(A, avoir.id);
    expect(lignes[0]?.montantHT).toBe("-90.00");
  });

  it("changerStatutFacture envoyee — décrément stock auto sur les lignes avec articleId", async () => {
    const repo = repoWithClient(A, 100);
    const stockRepo = new FakeStockRepository();
    const stock = await stockRepo.create(A, { articleId: 42, reference: "ART-42", designation: "Peinture", quantiteEnStock: "10.00", articleType: "bibliotheque" });

    const f = await creerFacture(repo, A, {
      clientId: 100,
      lignes: [
        { designation: "Peinture", prixUnitaireHT: "50.00", quantite: "3", articleId: 42 },
        { designation: "Main d'œuvre", prixUnitaireHT: "80.00", quantite: "1" },
      ],
    });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader, undefined, stockRepo);

    const stockApres = await stockRepo.getById(A, stock.id);
    expect(stockApres?.quantiteEnStock).toBe("7.00");
  });

  it("changerStatutFacture envoyee — ligne sans articleId ou article sans stock = silencieux", async () => {
    const repo = repoWithClient(A, 100);
    const stockRepo = new FakeStockRepository();

    const f = await creerFacture(repo, A, {
      clientId: 100,
      lignes: [{ designation: "Fourniture", prixUnitaireHT: "20.00", quantite: "5", articleId: 99 }],
    });
    await expect(
      changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader, undefined, stockRepo),
    ).resolves.not.toThrow();
  });

  it("changerStatutFacture envoyee — idempotent : re-trigger ne re-décrémente pas (garde statut)", async () => {
    const repo = repoWithClient(A, 100);
    const stockRepo = new FakeStockRepository();
    const stock = await stockRepo.create(A, { articleId: 42, reference: "ART-42", designation: "Peinture", quantiteEnStock: "10.00", articleType: "bibliotheque" });

    const f = await creerFacture(repo, A, {
      clientId: 100,
      lignes: [{ designation: "Peinture", prixUnitaireHT: "50.00", quantite: "3", articleId: 42 }],
    });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader, undefined, stockRepo);
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader, undefined, stockRepo);

    const stockApres = await stockRepo.getById(A, stock.id);
    expect(stockApres?.quantiteEnStock).toBe("7.00");
  });

  it("ajouterReglement — facture non-émise → Conflict", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100, lignes: [{ designation: "L", prixUnitaireHT: "100.00" }] });
    await expect(
      ajouterReglement(repo, A, { factureId: f.id, montant: "50.00", date: new Date(), mode: "cheque" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("ajouterReglement — montant négatif/zéro → ValidationError", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100, lignes: [{ designation: "L", prixUnitaireHT: "100.00" }] });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);
    await expect(ajouterReglement(repo, A, { factureId: f.id, montant: "0", date: new Date(), mode: "cheque" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(ajouterReglement(repo, A, { factureId: f.id, montant: "-50", date: new Date(), mode: "cheque" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("ajouterReglement — sur-paiement → ValidationError", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, {
      clientId: 100,
      lignes: [{ designation: "L", prixUnitaireHT: "100.00" }],
    });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);
    await expect(ajouterReglement(repo, A, { factureId: f.id, montant: "121.00", date: new Date(), mode: "cheque" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("ajouterReglement — règlement unique = totalTTC → statut payee", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, {
      clientId: 100,
      lignes: [
        { designation: "L1", prixUnitaireHT: "50.00" },
        { designation: "L2", prixUnitaireHT: "50.00" },
      ],
    });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);

    const reglement = await ajouterReglement(repo, A, { factureId: f.id, montant: "120.00", date: new Date(), mode: "virement" });
    expect(reglement.id).toBeDefined();
    expect(reglement.montant).toBe("120.00");
    expect(reglement.mode).toBe("virement");

    const updated = await repo.getById(A, f.id);
    expect(updated?.montantPaye).toBe("120.00");
    expect(updated?.statut).toBe("payee");
  });

  it("ajouterReglement — deux règlements cumulés → montantPaye = somme", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, {
      clientId: 100,
      lignes: [{ designation: "L", prixUnitaireHT: "100.00" }],
    });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);

    const r1 = await ajouterReglement(repo, A, { factureId: f.id, montant: "60.00", date: new Date("2026-06-01"), mode: "cheque" });
    expect(r1.montant).toBe("60.00");

    const r2 = await ajouterReglement(repo, A, { factureId: f.id, montant: "60.00", date: new Date("2026-06-15"), mode: "virement" });
    expect(r2.montant).toBe("60.00");

    const updated = await repo.getById(A, f.id);
    expect(updated?.montantPaye).toBe("120.00");
    expect(updated?.statut).toBe("payee");
  });

  it("ajouterReglement — cross-tenant → NotFoundError", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, { clientId: 100, lignes: [{ designation: "L", prixUnitaireHT: "100.00" }] });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);
    await expectCrossTenantDenied(() =>
      ajouterReglement(repo, B, { factureId: f.id, montant: "50.00", date: new Date(), mode: "cheque" }),
    );
  });

  it("ajouterReglement — cumul de deux règlements qui soldent la facture", async () => {
    const repo = repoWithClient(A, 100);
    const f = await creerFacture(repo, A, {
      clientId: 100,
      lignes: [{ designation: "L", prixUnitaireHT: "100.00" }],
    });
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);

    const r1 = await ajouterReglement(repo, A, { factureId: f.id, montant: "60.00", date: new Date("2026-06-01"), mode: "cheque" });
    expect(r1.montant).toBe("60.00");

    const r2 = await ajouterReglement(repo, A, { factureId: f.id, montant: "60.00", date: new Date("2026-06-15"), mode: "virement" });
    expect(r2.montant).toBe("60.00");

    const updated = await repo.getById(A, f.id);
    expect(updated?.montantPaye).toBe("120.00");
    expect(updated?.statut).toBe("payee");
  });
});

/** Devis accepté de base (TVA 20 % : HT=1000, TTC=1200). */
const devisSituation = (over: Partial<DevisReadModel> = {}): DevisReadModel => ({
  id: 42,
  artisanId: 1,
  clientId: 100,
  numero: "DEV-00042",
  statut: "accepte",
  objet: "Rénovation",
  referenceClient: null,
  conditionsPaiement: null,
  notes: null,
  totalHT: "1000.00",
  totalTVA: "200.00",
  totalTTC: "1200.00",
  montantDejaFacture: "0.00",
  ...over,
});

describe("calculerMontantSituation — fonction pure (L1)", () => {
  it("30% sur un devis de 1200€ TTC (TVA 20%) → 360€ TTC, 300€ HT, taux 20%", () => {
    const r = calculerMontantSituation(30, "1200.00", "1000.00", "0.00");
    expect(r.montantSituationTTC).toBe(360);
    expect(r.montantHT).toBe(300);
    expect(r.tauxTVA).toBe("20.00");
  });

  it("deux situations successives : 30% puis 40% (cumul 70%)", () => {
    const s1 = calculerMontantSituation(30, "1200.00", "1000.00", "0.00");
    const s2 = calculerMontantSituation(70, "1200.00", "1000.00", s1.montantSituationTTC.toFixed(2));
    expect(s1.montantSituationTTC).toBe(360);
    expect(s2.montantSituationTTC).toBe(480);
    expect(s1.montantSituationTTC + s2.montantSituationTTC).toBe(840);
  });

  it("situation à 100% : solde le devis entier (moins déjà facturé)", () => {
    const r = calculerMontantSituation(100, "1200.00", "1000.00", "360.00");
    expect(r.montantSituationTTC).toBe(840);
  });

  it("pourcentage > 100 → ValidationError", () => {
    expect(() => calculerMontantSituation(101, "1200.00", "1000.00", "0.00")).toThrow(ValidationError);
  });

  it("pourcentage <= 0 → ValidationError", () => {
    expect(() => calculerMontantSituation(0, "1200.00", "1000.00", "0.00")).toThrow(ValidationError);
    expect(() => calculerMontantSituation(-5, "1200.00", "1000.00", "0.00")).toThrow(ValidationError);
  });

  it("situation déjà entièrement facturée → ValidationError (montant nul)", () => {
    expect(() => calculerMontantSituation(100, "1200.00", "1000.00", "1200.00")).toThrow(ValidationError);
  });

  it("cumul qui dépasserait le total → ValidationError", () => {
    expect(() => calculerMontantSituation(30, "1200.00", "1000.00", "1100.00")).toThrow(ValidationError);
  });
});

describe("facturerSituation — use-case (L1 fakes)", () => {
  function setup() {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    repo.registerDevis(A.artisanId, 42);
    const reader = new FakeDevisReader();
    return { repo, reader };
  }

  it("crée une facture brouillon liée au devis + met à jour montantDejaFacture", async () => {
    const { repo, reader } = setup();
    reader.register(devisSituation());
    const f = await facturerSituation(repo, reader, A, { devisId: 42, pourcentageCumule: 30 });
    expect(f.devisId).toBe(42);
    expect(f.clientId).toBe(100);
    expect(f.statut).toBe("brouillon");
    expect(f.totalTTC).toBe("360.00");
    const devisUpdated = await reader.getDevis(A, 42);
    expect(devisUpdated?.montantDejaFacture).toBe("360.00");
  });

  it("devis non accepté → ConflictError", async () => {
    const { repo, reader } = setup();
    reader.register(devisSituation({ statut: "envoye" }));
    await expect(facturerSituation(repo, reader, A, { devisId: 42, pourcentageCumule: 30 })).rejects.toBeInstanceOf(ConflictError);
  });

  it("devis d'un autre tenant → NotFoundError (anti-IDOR-FK)", async () => {
    const { repo, reader } = setup();
    reader.register(devisSituation({ artisanId: B.artisanId }));
    await expectCrossTenantDenied(() => facturerSituation(repo, reader, A, { devisId: 42, pourcentageCumule: 30 }));
  });

  it("deux situations successives : cumul cohérent", async () => {
    const { repo, reader } = setup();
    reader.register(devisSituation());
    const f1 = await facturerSituation(repo, reader, A, { devisId: 42, pourcentageCumule: 30 });
    const f2 = await facturerSituation(repo, reader, A, { devisId: 42, pourcentageCumule: 70 });
    expect(Number(f1.totalTTC) + Number(f2.totalTTC)).toBe(840);
    const devisUpdated = await reader.getDevis(A, 42);
    expect(devisUpdated?.montantDejaFacture).toBe("840.00");
  });

  it("pourcentage > 100 → ValidationError (garde)", async () => {
    const { repo, reader } = setup();
    reader.register(devisSituation());
    await expect(facturerSituation(repo, reader, A, { devisId: 42, pourcentageCumule: 110 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("concurrence : deux situations à 60% simultanées — la seconde échoue (anti-dépassement sous lock)", async () => {
    const { reader } = setup();
    const devis = devisSituation({ totalTTC: "100.00", totalHT: "83.33", totalTVA: "16.67" });
    reader.register(devis);
    const repoC = new FakeFactureRepository();
    repoC.registerClient(A.artisanId, devis.clientId);
    repoC.registerDevis(A.artisanId, devis.id);
    const results = await Promise.allSettled([
      facturerSituation(repoC, reader, A, { devisId: 42, pourcentageCumule: 60 }),
      facturerSituation(repoC, reader, A, { devisId: 42, pourcentageCumule: 60 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ValidationError);
    expect(await repoC.list(A)).toHaveLength(1);
    expect(Number((await reader.getDevis(A, 42))?.montantDejaFacture)).toBeCloseTo(60, 1);
  });

  it("rollback atomique : si maj cumul lève une erreur la facture ne persiste pas", async () => {
    const { reader } = setup();
    const devis = devisSituation();
    reader.register(devis);
    const repoAtomic = new FakeFactureRepository();
    repoAtomic.registerClient(A.artisanId, devis.clientId);
    repoAtomic.registerDevis(A.artisanId, devis.id);
    const boom = new Error("DB down");
    reader.register({ ...devis, updateMontantDejaFactureTx: undefined } as unknown as DevisReadModel);
    const origTx = reader.updateMontantDejaFactureTx.bind(reader);
    reader.updateMontantDejaFactureTx = () => Promise.reject(boom);

    await expect(facturerSituation(repoAtomic, reader, A, { devisId: 42, pourcentageCumule: 30 })).rejects.toThrow("DB down");
    /** La facture a été rollbackée — store vide. */
    expect(await repoAtomic.list(A)).toHaveLength(0);
    /** Le cumul devis est inchangé. */
    expect((await reader.getDevis(A, 42))?.montantDejaFacture).toBe("0.00");
    reader.updateMontantDejaFactureTx = origTx;
  });
});

/** Devis accepté simple pour les tests acompte (HT=1000, TVA=20%, TTC=1200). */
const devisAcompte = (over: Partial<DevisReadModel> = {}): DevisReadModel => ({
  id: 99,
  artisanId: A.artisanId,
  clientId: 100,
  numero: "DEV-00099",
  statut: "accepte",
  objet: "Travaux",
  referenceClient: null,
  conditionsPaiement: null,
  notes: null,
  totalHT: "1000.00",
  totalTVA: "200.00",
  totalTTC: "1200.00",
  montantDejaFacture: "0.00",
  ...over,
});

describe("facturerAcompte / facturerSolde", () => {
  function setup() {
    const reader = new FakeDevisReader();
    const repo = new FakeFactureRepository();
    const devis = devisAcompte();
    reader.register(devis, [
      {
        ordre: 0, reference: null, designation: "Pose", description: null,
        quantite: "1.00", unite: "unité", prixUnitaireHT: "1000.00",
        tauxTVA: "20.00", remise: "0", tvaCategorieId: null,
        montantHT: "1000.00", montantTVA: "200.00", montantTTC: "1200.00",
        type: "produit",
      },
    ]);
    repo.registerClient(A.artisanId, 100);
    repo.registerDevis(A.artisanId, 99);
    return { reader, repo, devis };
  }

  it("acompte 30 % → facture estAcompte=true, HT=300, TVA=60, TTC=360, devis montantDejaFacture=360", async () => {
    const { reader, repo } = setup();
    const a = await facturerAcompte(repo, reader, A, { devisId: 99, montant: "360" });
    expect(a.estAcompte).toBe(true);
    expect(a.totalHT).toBe("300.00");
    expect(a.totalTVA).toBe("60.00");
    expect(a.totalTTC).toBe("360.00");
    expect((await reader.getDevis(A, 99))?.montantDejaFacture).toBe("360.00");
  });

  it("acompte 30 % puis solde → Σ(acompte+solde).TTC = totalTTC devis + lignes déduction présentes", async () => {
    const { reader, repo } = setup();
    const acompte = await facturerAcompte(repo, reader, A, { devisId: 99, montant: "360" });
    const solde = await facturerSolde(repo, reader, A, { devisId: 99 });

    expect(Number(acompte.totalTTC) + Number(solde.totalTTC)).toBeCloseTo(1200, 1);
    const lignes = await repo.listLignes(A, solde.id);
    const deductionLignes = lignes.filter((l) => l.montantTTC < 0);
    expect(deductionLignes).toHaveLength(1);
    expect(Math.abs(Number(deductionLignes[0]?.montantTTC))).toBeCloseTo(360, 1);
  });

  it("multi-acomptes (30 % + 40 %) puis solde → Σ = 1200, 2 lignes déduction", async () => {
    const { reader, repo } = setup();
    const a1 = await facturerAcompte(repo, reader, A, { devisId: 99, montant: "360" });
    const a2 = await facturerAcompte(repo, reader, A, { devisId: 99, montant: "480" });
    const solde = await facturerSolde(repo, reader, A, { devisId: 99 });

    const total = Number(a1.totalTTC) + Number(a2.totalTTC) + Number(solde.totalTTC);
    expect(total).toBeCloseTo(1200, 1);

    const lignes = await repo.listLignes(A, solde.id);
    const deductions = lignes.filter((l) => l.montantTTC < 0);
    expect(deductions).toHaveLength(2);
  });

  it("acompte dépassant le restant → ValidationError", async () => {
    const { reader, repo } = setup();
    await facturerAcompte(repo, reader, A, { devisId: 99, montant: "900" });
    await expect(facturerAcompte(repo, reader, A, { devisId: 99, montant: "400" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("devis non-accepté → ConflictError", async () => {
    const reader = new FakeDevisReader();
    reader.register({ ...devisAcompte(), statut: "brouillon" });
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    await expect(facturerAcompte(repo, reader, A, { devisId: 99, montant: "100" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("facturerSolde si solde déjà existant → ConflictError (existsForDevis)", async () => {
    const { reader, repo } = setup();
    await facturerSolde(repo, reader, A, { devisId: 99 });
    await expect(facturerSolde(repo, reader, A, { devisId: 99 })).rejects.toBeInstanceOf(ConflictError);
  });

  it("cross-tenant : facturerAcompte d'un devis d'un autre tenant → NotFoundError", async () => {
    const { reader, repo } = setup();
    await expect(facturerAcompte(repo, reader, B, { devisId: 99, montant: "100" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
