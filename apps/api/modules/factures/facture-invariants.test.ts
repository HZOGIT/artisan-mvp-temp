import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "./infra/facture-repository-fake";
import { FakeDevisReader } from "./infra/devis-reader-fake";
import {
  creerFacture,
  modifierFacture,
  supprimerFacture,
  ajouterLigneFacture,
  changerStatutFacture,
  enregistrerPaiementFacture,
  creerAvoir,
  convertirDevisEnFacture,
} from "./application/write-use-cases";
import { getFacture, listLignesFacture } from "./application/read-use-cases";
import { ConflictError, NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";
import type { DevisReadModel } from "./application/devis-reader";

// Revue de synthèse des invariants métier du domaine factures (financier CRITIQUE — pièce légale).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const fakeArtisanReader = { getArtisan: async () => ({ id: 1, nomEntreprise: null, email: null, siret: "73282932000074" }) };

function repoWithClient(cid = 100): FakeFactureRepository {
  const repo = new FakeFactureRepository();
  repo.registerClient(A.artisanId, cid);
  return repo;
}
async function factureEmise(repo: FakeFactureRepository): Promise<number> {
  const f = await creerFacture(repo, A, { clientId: 100 });
  await ajouterLigneFacture(repo, A, f.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
  await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);
  return f.id;
}
const devisAccepte = (over: Partial<DevisReadModel> = {}): DevisReadModel => ({
  id: 7, artisanId: 1, clientId: 100, numero: "DEV-1", statut: "accepte", objet: null,
  referenceClient: null, conditionsPaiement: null, notes: null, totalHT: "0.00", totalTVA: "0.00", totalTTC: "0.00", ...over,
});

describe("factures — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD + lignes + transitions/paiement/avoir d'un autre tenant → NotFound/[]", async () => {
    const repo = repoWithClient();
    const id = await factureEmise(repo);
    await expect(getFacture(repo, B, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierFacture(repo, B, id, { objet: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(changerStatutFacture(repo, B, id, "en_retard")).rejects.toBeInstanceOf(NotFoundError);
    await expect(enregistrerPaiementFacture(repo, B, id, { montant: "1" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(creerAvoir(repo, B, id, { lignes: [{ designation: "x", quantite: "1", prixUnitaireHT: "1" }] })).rejects.toBeInstanceOf(NotFoundError);
    expect(await listLignesFacture(repo, B, id)).toEqual([]);
  });

  it("INV-2 : numérotation maîtrisée — FAC- auto scopé tenant, immuable via update", async () => {
    const repo = repoWithClient();
    repo.registerClient(B.artisanId, 200);
    const f1 = await creerFacture(repo, A, { clientId: 100 });
    const f2 = await creerFacture(repo, A, { clientId: 100 });
    expect(f1.numero).toBe("FAC-00001");
    expect(f2.numero).toBe("FAC-00002");
    expect((await creerFacture(repo, B, { clientId: 200 })).numero).toBe("FAC-00001"); // scopé tenant
    expect((await modifierFacture(repo, A, f1.id, { objet: "maj" })).numero).toBe("FAC-00001"); // immuable
  });

  it("INV-3 : TVA/totaux dérivés serveur — totalTTC = Σ lignes = totalHT + totalTVA ; section neutre", async () => {
    const repo = repoWithClient();
    const f = await creerFacture(repo, A, { clientId: 100 });
    await ajouterLigneFacture(repo, A, f.id, { designation: "P", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" });
    await ajouterLigneFacture(repo, A, f.id, { designation: "— Lot —", type: "section", quantite: "9", prixUnitaireHT: "999" });
    const fv = await getFacture(repo, A, f.id);
    expect(fv.totalHT).toBe("200.00");
    expect(fv.totalTTC).toBe("240.00");
    expect(Number(fv.totalTTC)).toBeCloseTo(Number(fv.totalHT) + Number(fv.totalTVA), 2);
  });

  it("INV-4 : anti-IDOR-FK — clientId / devisId hors tenant → NotFound", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(B.artisanId, 77);
    await expect(creerFacture(repo, A, { clientId: 77 })).rejects.toBeInstanceOf(NotFoundError);
    repo.registerClient(A.artisanId, 100);
    repo.registerDevis(B.artisanId, 9);
    await expect(creerFacture(repo, A, { clientId: 100, devisId: 9 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("INV-5 : immutabilité post-émission — facture non-brouillon → modif/suppr/lignes Conflict", async () => {
    const repo = repoWithClient();
    const id = await factureEmise(repo); // envoyee
    await expect(modifierFacture(repo, A, id, { objet: "x" })).rejects.toBeInstanceOf(ConflictError);
    await expect(supprimerFacture(repo, A, id)).rejects.toBeInstanceOf(ConflictError);
    await expect(ajouterLigneFacture(repo, A, id, { designation: "y", prixUnitaireHT: "1" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("INV-6 : machine à états — transitions valides only ; terminaux figés", async () => {
    const repo = repoWithClient();
    const f = await creerFacture(repo, A, { clientId: 100 });
    await expect(changerStatutFacture(repo, A, f.id, "payee")).rejects.toBeInstanceOf(ConflictError); // saute envoyee
    await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);
    await changerStatutFacture(repo, A, f.id, "payee");
    await expect(changerStatutFacture(repo, A, f.id, "en_retard")).rejects.toBeInstanceOf(ConflictError); // payee terminal
  });

  it("INV-7 : paiement — anti-sur-paiement ; payee si soldée ; brouillon → Conflict", async () => {
    const repo = repoWithClient();
    const brouillon = await creerFacture(repo, A, { clientId: 100 });
    await ajouterLigneFacture(repo, A, brouillon.id, { designation: "L", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
    await expect(enregistrerPaiementFacture(repo, A, brouillon.id, { montant: "10" })).rejects.toBeInstanceOf(ConflictError);
    const id = await factureEmise(repo);
    await expect(enregistrerPaiementFacture(repo, A, id, { montant: "999" })).rejects.toBeInstanceOf(ValidationError); // sur-paiement
    expect((await enregistrerPaiementFacture(repo, A, id, { montant: "120.00" })).statut).toBe("payee");
  });

  it("INV-8 : avoir — montants négatifs ; anti-sur-avoir", async () => {
    const repo = repoWithClient();
    const id = await factureEmise(repo); // 120.00 TTC
    const avoir = await creerAvoir(repo, A, id, { lignes: [{ designation: "R", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }] });
    expect(avoir.totalTTC).toBe("-120.00");
    await expect(creerAvoir(repo, A, id, { lignes: [{ designation: "Trop", quantite: "1", prixUnitaireHT: "10", tauxTVA: "20" }] })).rejects.toBeInstanceOf(ConflictError);
  });

  it("INV-9 : conversion devis→facture — devis accepté requis + anti-doublon", async () => {
    const repo = repoWithClient();
    const reader = new FakeDevisReader();
    reader.register(devisAccepte({ statut: "envoye" }), []);
    await expect(convertirDevisEnFacture(repo, reader, A, 7)).rejects.toBeInstanceOf(ConflictError); // non accepté
    const reader2 = new FakeDevisReader();
    reader2.register(devisAccepte(), []);
    await convertirDevisEnFacture(repo, reader2, A, 7);
    await expect(convertirDevisEnFacture(repo, reader2, A, 7)).rejects.toBeInstanceOf(ConflictError); // doublon
  });
});
