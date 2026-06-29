import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { creerFacture, ajouterLigneFacture, changerStatutFacture, marquerFacturePayee } from "./write-use-cases";
import type { ComptaPort } from "./compta-port";
import { NotFoundError, ValidationError } from "../../../shared/errors";
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

  it("échec compta → erreur propagée (inaltérabilité : pas d'écriture sans verrouillage)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const compta = new SpyComptaPort(true);
    await expect(
      marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-03-10" }, compta),
    ).rejects.toThrow("compta KO");
  });
});
