import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { creerFacture, ajouterLigneFacture, changerStatutFacture, enregistrerPaiementFacture, creerAvoir } from "./write-use-cases";
import type { ComptaPort } from "./compta-port";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };

// Double capturant : enregistre les appels au port compta (FEC) pour les assertions.
class FakeComptaPort implements ComptaPort {
  vente: number[] = [];
  encaissement: number[] = [];
  async genererEcrituresVente(_ctx: TenantContext, factureId: number): Promise<void> {
    this.vente.push(factureId);
  }
  async genererEcrituresEncaissement(_ctx: TenantContext, factureId: number): Promise<void> {
    this.encaissement.push(factureId);
  }
}

async function factureEmise(repo: FakeFactureRepository): Promise<number> {
  const f = await creerFacture(repo, A, { clientId: 100 });
  await ajouterLigneFacture(repo, A, f.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
  await changerStatutFacture(repo, A, f.id, "envoyee");
  return f.id;
}

describe("factures — hook compta (FEC) au paiement", () => {
  it("paiement SOLDANT déclenche les écritures vente + encaissement (1 fois chacune)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const compta = new FakeComptaPort();
    const id = await factureEmise(repo); // 120.00 TTC
    await enregistrerPaiementFacture(repo, A, id, { montant: "120.00" }, compta);
    expect(compta.vente).toEqual([id]);
    expect(compta.encaissement).toEqual([id]);
  });

  it("paiement PARTIEL (non soldé) ne déclenche aucune écriture", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const compta = new FakeComptaPort();
    const id = await factureEmise(repo);
    await enregistrerPaiementFacture(repo, A, id, { montant: "50.00" }, compta);
    expect(compta.vente).toEqual([]);
    expect(compta.encaissement).toEqual([]);
  });

  it("creerAvoir (note de crédit, statut validee) génère les écritures de l'avoir → réduit la TVA collectée", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const compta = new FakeComptaPort();
    const id = await factureEmise(repo); // facture émise 120.00 TTC (émission sans compta → vente vide)
    expect(compta.vente).toEqual([]);
    const avoir = await creerAvoir(
      repo,
      A,
      id,
      { lignes: [{ designation: "Remboursement", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }] },
      compta,
    );
    expect(avoir.typeDocument).toBe("avoir");
    // L'avoir déclenche la génération de SES écritures de vente (journal VE, TVA inversée via isAvoir)
    // → sans cet appel, la note de crédit ne réduirait jamais la TVA collectée / le grand livre.
    expect(compta.vente).toEqual([avoir.id]);
    expect(compta.encaissement).toEqual([]); // un avoir n'a pas d'encaissement
  });

  it("sans port compta fourni (défaut no-op) : le paiement reste fonctionnel", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const f = await enregistrerPaiementFacture(repo, A, id, { montant: "120.00" });
    expect(f.statut).toBe("payee");
  });
});
