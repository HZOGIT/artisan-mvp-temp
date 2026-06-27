import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
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
  creerAvoir,
} from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

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
    expect(p1.statut).toBe("envoyee"); // pas encore soldée
    const p2 = await enregistrerPaiementFacture(repo, A, id, { montant: "70.00", mode: "virement" });
    expect(p2.montantPaye).toBe("120.00");
    expect(p2.statut).toBe("payee"); // soldée
    expect(p2.modePaiement).toBe("virement");
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
});
