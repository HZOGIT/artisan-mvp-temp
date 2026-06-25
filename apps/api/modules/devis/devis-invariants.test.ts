import { describe, it, expect } from "vitest";
import { FakeDevisRepository } from "./infra/devis-repository-fake";
import {
  creerDevis,
  modifierDevis,
  supprimerDevis,
  ajouterLigneDevis,
  changerStatutDevis,
} from "./application/write-use-cases";
import { getDevis, listLignesDevis } from "./application/read-use-cases";
import { ConflictError, NotFoundError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine devis (commercial/financier — sensible).
const A: TenantContext = { artisanId: 1, userId: 50 };
const fakeArtisanReader = { getArtisan: async () => ({ id: 1, nomEntreprise: null, email: null, siret: "73282932000074" }) };
const B: TenantContext = { artisanId: 2, userId: 20 };

function repoWithClient(ctx: TenantContext, cid: number): FakeDevisRepository {
  const repo = new FakeDevisRepository();
  repo.registerClient(ctx.artisanId, cid);
  return repo;
}

describe("devis — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD + lignes + transitions d'un autre tenant → NotFound/[]", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await expect(getDevis(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierDevis(repo, B, d.id, { objet: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(changerStatutDevis(repo, B, d.id, "envoye")).rejects.toBeInstanceOf(NotFoundError);
    await expect(ajouterLigneDevis(repo, B, d.id, { designation: "x", prixUnitaireHT: "1" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await listLignesDevis(repo, B, d.id)).toEqual([]);
  });

  it("INV-2 : numérotation maîtrisée — numero auto DEV-…, scopé tenant, immuable via update", async () => {
    const repo = repoWithClient(A, 100);
    repo.registerClient(B.artisanId, 200);
    const d1 = await creerDevis(repo, A, { clientId: 100 });
    const d2 = await creerDevis(repo, A, { clientId: 100 });
    expect(d1.numero).toBe("DEV-00001");
    expect(d2.numero).toBe("DEV-00002");
    expect((await creerDevis(repo, B, { clientId: 200 })).numero).toBe("DEV-00001"); // scopé tenant
    // `UpdateDevisInput` n'expose pas numero → immuable
    expect((await modifierDevis(repo, A, d1.id, { objet: "maj" })).numero).toBe("DEV-00001");
  });

  it("INV-3 : TVA/totaux dérivés serveur — totalTTC = Σ lignes = totalHT + totalTVA ; section neutre", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await ajouterLigneDevis(repo, A, d.id, { designation: "Pose", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" });
    await ajouterLigneDevis(repo, A, d.id, { designation: "— Lot —", type: "section", quantite: "9", prixUnitaireHT: "999" });
    const dv = await getDevis(repo, A, d.id);
    expect(dv.totalHT).toBe("200.00");
    expect(dv.totalTVA).toBe("40.00");
    expect(dv.totalTTC).toBe("240.00");
    expect(Number(dv.totalTTC)).toBeCloseTo(Number(dv.totalHT) + Number(dv.totalTVA), 2);
  });

  it("INV-4 : anti-IDOR-FK — clientId hors tenant → NotFound", async () => {
    const repo = repoWithClient(B, 77); // 77 appartient à B
    await expect(creerDevis(repo, A, { clientId: 77 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("INV-5 : immutabilité post-acceptation — devis accepté figé (modif/suppr/lignes → Conflict)", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await changerStatutDevis(repo, A, d.id, "envoye", fakeArtisanReader);
    await changerStatutDevis(repo, A, d.id, "accepte");
    await expect(modifierDevis(repo, A, d.id, { objet: "x" })).rejects.toBeInstanceOf(ConflictError);
    await expect(supprimerDevis(repo, A, d.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(ajouterLigneDevis(repo, A, d.id, { designation: "y", prixUnitaireHT: "1" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("INV-6 : machine à états — transitions valides only ; terminaux figés ; idempotence", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await expect(changerStatutDevis(repo, A, d.id, "accepte")).rejects.toBeInstanceOf(ConflictError); // saute envoye
    expect((await changerStatutDevis(repo, A, d.id, "envoye", fakeArtisanReader)).statut).toBe("envoye");
    expect((await changerStatutDevis(repo, A, d.id, "envoye")).statut).toBe("envoye"); // idempotent
    await changerStatutDevis(repo, A, d.id, "expire");
    await expect(changerStatutDevis(repo, A, d.id, "accepte")).rejects.toBeInstanceOf(ConflictError); // terminal figé
  });

  it("INV-7 : numero/statut/totaux inviolables via update (UpdateDevisInput ne les expose pas)", async () => {
    const repo = repoWithClient(A, 100);
    const d = await creerDevis(repo, A, { clientId: 100 });
    await ajouterLigneDevis(repo, A, d.id, { designation: "L", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
    const before = await getDevis(repo, A, d.id);
    await modifierDevis(repo, A, d.id, { objet: "renommé" });
    const after = await getDevis(repo, A, d.id);
    expect(after.numero).toBe(before.numero);
    expect(after.statut).toBe("brouillon");
    expect(after.totalTTC).toBe("120.00"); // dérivé des lignes, inchangé par un update de métadonnées
    expect(after.objet).toBe("renommé");
  });
});
