import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { creerFacture, ajouterLigneFacture, changerStatutFacture, marquerFacturePayee } from "./write-use-cases";
import type { ComptaPort } from "./compta-port";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

// Espionne le ComptaPort : capture les appels (ordre/ids) ; option d'échec pour le best-effort.
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
}

async function factureEmise(repo: FakeFactureRepository): Promise<number> {
  const f = await creerFacture(repo, A, { clientId: 100 });
  await ajouterLigneFacture(repo, A, f.id, { designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" });
  await changerStatutFacture(repo, A, f.id, "envoyee");
  return f.id;
}

// L1 — `marquerFacturePayee` (parité legacy `markAsPaid`) : écrase montantPaye, force statut=payee, puis
// génère les écritures FEC (vente + encaissement) en best-effort. Couvre le happy path + ordre des
// écritures, la garde date invalide AVANT toute écriture, l'anti-IDOR, et le best-effort (échec compta
// ne casse pas le paiement). Gap détecté it.76 : ce use-case n'avait aucun test unitaire.
describe("factures — marquerFacturePayee (markAsPaid + FEC)", () => {
  it("force statut=payee, écrase montantPaye, génère vente puis encaissement (dans l'ordre)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const compta = new SpyComptaPort();
    const f = await marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-03-10" }, compta);
    expect(f.statut).toBe("payee");
    expect(f.montantPaye).toBe("120.00");
    expect(compta.calls).toEqual([`vente:${id}`, `encaissement:${id}`]);
  });

  it("date de paiement invalide → ValidationError AVANT toute écriture (aucun appel compta)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const compta = new SpyComptaPort();
    await expect(marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "pas-une-date" }, compta)).rejects.toBeInstanceOf(ValidationError);
    expect(compta.calls).toEqual([]); // garde AVANT l'écriture en base + compta
  });

  it("facture d'un autre tenant → NotFoundError (anti-IDOR)", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    await expect(marquerFacturePayee(repo, B, id, { montantPaye: "120.00", datePaiement: "2026-03-10" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("best-effort compta : un échec de génération d'écritures ne casse pas le paiement", async () => {
    const repo = new FakeFactureRepository();
    repo.registerClient(A.artisanId, 100);
    const id = await factureEmise(repo);
    const compta = new SpyComptaPort(true); // genererEcritures* throw
    const f = await marquerFacturePayee(repo, A, id, { montantPaye: "120.00", datePaiement: "2026-03-10" }, compta);
    expect(f.statut).toBe("payee"); // paiement bien enregistré malgré l'échec compta
    expect(compta.calls).toContain(`vente:${id}`); // tenté
  });
});
