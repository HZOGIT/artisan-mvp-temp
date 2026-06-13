import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import {
  creerFacture,
  modifierFacture,
  supprimerFacture,
  ajouterLigneFacture,
  modifierLigneFacture,
  supprimerLigneFacture,
} from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

function repoWithClient(ctx: TenantContext, cid: number): FakeFactureRepository {
  const repo = new FakeFactureRepository();
  repo.registerClient(ctx.artisanId, cid);
  return repo;
}

describe("factures — use-cases d'écriture", () => {
  it("creerFacture génère le numéro serveur (FAC-00001) et scope au tenant", async () => {
    const repo = repoWithClient(A, 100);
    const f1 = await creerFacture(repo, A, { clientId: 100, objet: "Travaux" });
    const f2 = await creerFacture(repo, A, { clientId: 100 });
    expect(f1.numero).toBe("FAC-00001");
    expect(f2.numero).toBe("FAC-00002");
    expect(f1.statut).toBe("brouillon");
    expect(f1.totalTTC).toBe("0.00");
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
});
