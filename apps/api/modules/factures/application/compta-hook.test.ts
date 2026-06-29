import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { creerFacture, ajouterLigneFacture, changerStatutFacture, enregistrerPaiementFacture, marquerFacturePayee, creerAvoir } from "./write-use-cases";
import type { ComptaPort } from "./compta-port";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const fakeArtisanReader = { getArtisan: async () => ({ id: 1, nomEntreprise: null, email: null, siret: "73282932000074" }) };

/** Double capturant : enregistre les appels au port compta (FEC) pour les assertions. */
class FakeComptaPort implements ComptaPort {
  vente: number[] = [];
  encaissement: number[] = [];
  valider: number[] = [];
  async genererEcrituresVente(_ctx: TenantContext, factureId: number): Promise<void> {
    this.vente.push(factureId);
  }
  async genererEcrituresEncaissement(_ctx: TenantContext, factureId: number): Promise<void> {
    this.encaissement.push(factureId);
  }
  async validerEcritures(_ctx: TenantContext, factureId: number): Promise<void> {
    this.valider.push(factureId);
  }
}

async function factureEmise(repo: FakeFactureRepository): Promise<number> {
  const f = await creerFacture(repo, A, { clientId: 100 });
  await ajouterLigneFacture(repo, A, f.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
  await changerStatutFacture(repo, A, f.id, "envoyee", undefined, fakeArtisanReader);
  return f.id;
}

describe("factures — hook compta (FEC) au paiement", () => {
  it("paiement SOLDANT déclenche vente + encaissement + validerEcritures (OPE-753)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const compta = new FakeComptaPort();
    const id = await factureEmise(repo);
    await enregistrerPaiementFacture(repo, A, id, { montant: "120.00" }, compta);
    expect(compta.vente).toEqual([id]);
    expect(compta.encaissement).toEqual([id]);
    expect(compta.valider).toEqual([id]);
  });

  it("paiement PARTIEL (non soldé) ne déclenche aucune écriture", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const compta = new FakeComptaPort();
    const id = await factureEmise(repo);
    await enregistrerPaiementFacture(repo, A, id, { montant: "50.00" }, compta);
    expect(compta.vente).toEqual([]);
    expect(compta.encaissement).toEqual([]);
    expect(compta.valider).toEqual([]);
  });

  it("marquerFacturePayee déclenche vente + encaissement + validerEcritures (OPE-753)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const compta = new FakeComptaPort();
    const id = await factureEmise(repo);
    await marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-06-29" }, compta);
    expect(compta.vente).toEqual([id]);
    expect(compta.encaissement).toEqual([id]);
    expect(compta.valider).toEqual([id]);
  });

  it("creerAvoir (note de crédit, statut validee) génère vente + validerEcritures (OPE-753)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const compta = new FakeComptaPort();
    const id = await factureEmise(repo);
    const avoir = await creerAvoir(
      repo,
      A,
      id,
      { lignes: [{ designation: "Remboursement", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }] },
      compta,
    );
    expect(avoir.typeDocument).toBe("avoir");
    expect(compta.vente).toEqual([avoir.id]);
    expect(compta.encaissement).toEqual([]);
    expect(compta.valider).toEqual([avoir.id]);
  });

  it("sans port compta fourni (défaut no-op) : le paiement reste fonctionnel", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const f = await enregistrerPaiementFacture(repo, A, id, { montant: "120.00" });
    expect(f.statut).toBe("payee");
  });

  it("paiement soldant : échec compta best-effort → paiement committé, pas d'exception", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const comptaFail = new FakeComptaPort();
    comptaFail.genererEcrituresVente = async () => { throw new Error("compta KO"); };
    const f = await enregistrerPaiementFacture(repo, A, id, { montant: "120.00" }, comptaFail);
    expect(f.statut).toBe("payee");
  });
});
