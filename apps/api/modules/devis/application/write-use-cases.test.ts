import { describe, it, expect } from "vitest";
import { FakeDevisRepository } from "../infra/devis-repository-fake";
import {
  creerDevis,
  modifierDevis,
  supprimerDevis,
  ajouterLigneDevis,
  modifierLigneDevis,
  supprimerLigneDevis,
  changerStatutDevis,
  dupliquerDevis,
} from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const fakeArtisanReader = { getArtisan: async () => ({ id: 1, nomEntreprise: null, email: null, siret: "73282932000074" }) };

// Crée un repo avec le client `cid` enregistré comme appartenant au tenant `ctx`.
function repoWithClient(ctx: TenantContext, cid: number): FakeDevisRepository {
  const repo = new FakeDevisRepository();
  repo.registerClient(ctx.artisanId, cid);
  return repo;
}

describe("devis — use-cases d'écriture", () => {
  it("creerDevis génère le numéro serveur (DEV-00001) et scope au tenant", async () => {
    const repo = repoWithClient(A, 100);
    const d1 = await creerDevis(repo, A, { clientId: 100, objet: "Réno" });
    const d2 = await creerDevis(repo, A, { clientId: 100 });
    expect(d1.numero).toBe("DEV-00001");
    expect(d2.numero).toBe("DEV-00002");
    expect(d1.statut).toBe("brouillon");
    expect(d1.totalTTC).toBe("0.00");
  });

  it("creerDevis — clientId hors tenant → NotFound (anti-IDOR-FK)", async () => {
    const repo = repoWithClient(B, 77); // le client 77 appartient à B, pas à A
    await expectCrossTenantDenied(() => creerDevis(repo, A, { clientId: 77 }));
    await expect(creerDevis(repo, A, { clientId: 77 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("modifierDevis — métadonnées OK ; cross-tenant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100, objet: "Avant" });
    expect((await modifierDevis(repo, A, d.id, { objet: "Après" })).objet).toBe("Après");
    await expectCrossTenantDenied(() => modifierDevis(repo, B, d.id, { objet: "hack" }));
  });

  it("IMMUTABILITÉ : un devis envoyé ne peut plus être modifié → Conflict", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    repo.setStatutForTest(d.id, "envoye");
    await expect(modifierDevis(repo, A, d.id, { objet: "x" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("IMMUTABILITÉ : un devis accepté ne peut plus être modifié/supprimé → Conflict", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    repo.setStatutForTest(d.id, "accepte");
    await expect(modifierDevis(repo, A, d.id, { objet: "x" })).rejects.toBeInstanceOf(ConflictError);
    await expect(supprimerDevis(repo, A, d.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("supprimerDevis — brouillon OK ; inexistant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await supprimerDevis(repo, A, d.id);
    expect(await repo.list(A)).toEqual([]);
    await expect(supprimerDevis(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ajouterLigneDevis — recalcule les totaux ; designation vide → Validation ; prix négatif → Validation", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    const l = await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" });
    expect(l.montantTTC).toBe("240.00");
    expect((await repo.getById(A, d.id))?.totalTTC).toBe("240.00");
    await expect(ajouterLigneDevis(repo, A, d.id, { designation: "  ", prixUnitaireHT: "10" })).rejects.toBeInstanceOf(ValidationError);
    await expect(ajouterLigneDevis(repo, A, d.id, { designation: "X", prixUnitaireHT: "-5" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("ajouterLigneDevis — sur un devis d'un autre tenant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await expect(ajouterLigneDevis(repo, B, d.id, { designation: "Vol", prixUnitaireHT: "1" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("IMMUTABILITÉ lignes : pas d'ajout/modif/suppr de ligne sur un devis envoyé → Conflict", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    const l = await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00" });
    repo.setStatutForTest(d.id, "envoye");
    await expect(ajouterLigneDevis(repo, A, d.id, { designation: "Y", prixUnitaireHT: "1" })).rejects.toBeInstanceOf(ConflictError);
    await expect(modifierLigneDevis(repo, A, d.id, l.id, { quantite: "9" })).rejects.toBeInstanceOf(ConflictError);
    await expect(supprimerLigneDevis(repo, A, d.id, l.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("IMMUTABILITÉ lignes : pas d'ajout/modif/suppr de ligne sur un devis accepté → Conflict", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    const l = await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00" });
    repo.setStatutForTest(d.id, "accepte");
    await expect(ajouterLigneDevis(repo, A, d.id, { designation: "Y", prixUnitaireHT: "1" })).rejects.toBeInstanceOf(ConflictError);
    await expect(modifierLigneDevis(repo, A, d.id, l.id, { quantite: "9" })).rejects.toBeInstanceOf(ConflictError);
    await expect(supprimerLigneDevis(repo, A, d.id, l.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("modifier/supprimer ligne — recalcul totaux ; ligne hors devis → NotFound ; cross-tenant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    const l = await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
    await modifierLigneDevis(repo, A, d.id, l.id, { quantite: "3" });
    expect((await repo.getById(A, d.id))?.totalTTC).toBe("360.00");
    await expect(modifierLigneDevis(repo, A, d.id, 999999, { quantite: "1" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerLigneDevis(repo, B, d.id, l.id)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerLigneDevis(repo, A, d.id, l.id);
    expect((await repo.getById(A, d.id))?.totalTTC).toBe("0.00");
  });

  it("changerStatutDevis — machine à états : brouillon→envoye→accepte ; idempotence", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00" });
    expect((await changerStatutDevis(repo, A, d.id, "envoye", fakeArtisanReader)).statut).toBe("envoye");
    expect((await changerStatutDevis(repo, A, d.id, "envoye")).statut).toBe("envoye"); // idempotent
    expect((await changerStatutDevis(repo, A, d.id, "accepte")).statut).toBe("accepte");
    expect((await changerStatutDevis(repo, A, d.id, "accepte")).statut).toBe("accepte"); // idempotent
  });

  it("changerStatutDevis — transitions invalides → Conflict ; états terminaux figés", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    // brouillon → accepte (saute envoye) interdit (transition check avant garde lignes)
    await expect(changerStatutDevis(repo, A, d.id, "accepte")).rejects.toBeInstanceOf(ConflictError);
    await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00" });
    await changerStatutDevis(repo, A, d.id, "envoye", fakeArtisanReader);
    await changerStatutDevis(repo, A, d.id, "refuse");
    // refuse est terminal → toute autre transition → Conflict
    await expect(changerStatutDevis(repo, A, d.id, "envoye")).rejects.toBeInstanceOf(ConflictError);
    await expect(changerStatutDevis(repo, A, d.id, "accepte")).rejects.toBeInstanceOf(ConflictError);
  });

  it("changerStatutDevis — devis d'un autre tenant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await expectCrossTenantDenied(() => changerStatutDevis(repo, B, d.id, "envoye"));
    await expect(changerStatutDevis(repo, B, d.id, "envoye")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("GARDE LIGNES : envoyer un devis sans ligne → ValidationError", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await expect(changerStatutDevis(repo, A, d.id, "envoye", fakeArtisanReader)).rejects.toBeInstanceOf(ValidationError);
  });

  it("GARDE LIGNES : envoyer un devis avec lignes et montant > 0 → OK", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00" });
    const result = await changerStatutDevis(repo, A, d.id, "envoye", fakeArtisanReader);
    expect(result.statut).toBe("envoye");
  });

  it("GARDE LIGNES : accepter un devis avec totalHT = 0 → ValidationError", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    repo.setStatutForTest(d.id, "envoye");
    await expect(changerStatutDevis(repo, A, d.id, "accepte")).rejects.toBeInstanceOf(ValidationError);
  });

  it("dupliquerDevis : nouveau brouillon, numéro serveur, objet (copie), validité +30j, lignes copiées", async () => {
    const repo = repoWithClient(A, 100);
    const origine = await creerDevis(repo, A, { clientId: 100, objet: "Réno cuisine" });
    await ajouterLigneDevis(repo, A, origine.id, { designation: "Pose", prixUnitaireHT: "300.00", quantite: "2" });
    await changerStatutDevis(repo, A, origine.id, "envoye", fakeArtisanReader); // l'origine peut être dans un autre statut

    const copie = await dupliquerDevis(repo, A, origine.id, () => new Date("2026-06-14T00:00:00Z"));
    expect(copie.id).not.toBe(origine.id);
    expect(copie.numero).toBe("DEV-00002");
    expect(copie.statut).toBe("brouillon"); // toujours un nouveau brouillon
    expect(copie.objet).toBe("Réno cuisine (copie)");
    expect(copie.dateValidite?.toISOString().slice(0, 10)).toBe("2026-07-14"); // +30 j
    // lignes copiées + totaux recalculés (2 × 300 = 600 HT)
    expect(await repo.listLignes(A, copie.id)).toHaveLength(1);
    expect(copie.totalHT).toBe("600.00");
  });

  it("dupliquerDevis : devis hors tenant → NotFound", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await expectCrossTenantDenied(() => dupliquerDevis(repo, B, d.id));
  });

  describe("VERROU SIGNATURE : devis signé par le client (signature.statut=accepte)", () => {
    it("modifier un devis brouillon avec signature acceptée → Conflict", async () => {
      const repo = repoWithClient(A, 100);
      const d = await creerDevis(repo, A, { clientId: 100 });
      repo.registerSignatureAccepteeForTest(d.id);
      await expect(modifierDevis(repo, A, d.id, { objet: "x" })).rejects.toBeInstanceOf(ConflictError);
    });

    it("ajouter/modifier/supprimer ligne sur devis brouillon avec signature acceptée → Conflict", async () => {
      const repo = repoWithClient(A, 100);
      const d = await creerDevis(repo, A, { clientId: 100 });
      const l = await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", prixUnitaireHT: "100.00", quantite: "1" });
      repo.registerSignatureAccepteeForTest(d.id);
      await expect(ajouterLigneDevis(repo, A, d.id, { designation: "Extra", prixUnitaireHT: "50.00" })).rejects.toBeInstanceOf(ConflictError);
      await expect(modifierLigneDevis(repo, A, d.id, l.id, { quantite: "2" })).rejects.toBeInstanceOf(ConflictError);
      await expect(supprimerLigneDevis(repo, A, d.id, l.id)).rejects.toBeInstanceOf(ConflictError);
    });

    it("changerStatut vers refuse/expire sur devis avec signature acceptée → Conflict", async () => {
      const repo = repoWithClient(A, 100);
      const d = await creerDevis(repo, A, { clientId: 100 });
      await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", prixUnitaireHT: "100.00", quantite: "1" });
      repo.setStatutForTest(d.id, "envoye");
      repo.registerSignatureAccepteeForTest(d.id);
      await expect(changerStatutDevis(repo, A, d.id, "refuse")).rejects.toBeInstanceOf(ConflictError);
      await expect(changerStatutDevis(repo, A, d.id, "expire")).rejects.toBeInstanceOf(ConflictError);
    });

    it("changerStatut vers accepte sur devis envoye avec signature acceptée → OK (réconciliation)", async () => {
      const repo = repoWithClient(A, 100);
      const d = await creerDevis(repo, A, { clientId: 100 });
      await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", prixUnitaireHT: "100.00", quantite: "1" });
      repo.setStatutForTest(d.id, "envoye");
      repo.registerSignatureAccepteeForTest(d.id);
      const result = await changerStatutDevis(repo, A, d.id, "accepte");
      expect(result.statut).toBe("accepte");
    });
  });
});
