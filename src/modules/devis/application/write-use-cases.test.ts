import { describe, it, expect } from "vitest";
import { FakeDevisRepository } from "../infra/devis-repository-fake";
import {
  creerDevis,
  modifierDevis,
  supprimerDevis,
  ajouterLigneDevis,
  modifierLigneDevis,
  supprimerLigneDevis,
} from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

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
});
