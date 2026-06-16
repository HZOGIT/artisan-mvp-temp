import { describe, it, expect } from "vitest";
import { FakeTransactionBancaireRepository } from "../infra/transaction-bancaire-repository-fake";
import { FakeDepenseRepository } from "../infra/depense-repository-fake";
import { getTransactionsBancaires, ignorerTransaction, importReleve, convertirTransaction, suggererCategorie } from "./transactions-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRegleCategorisationRepository } from "../../regles-categorisation/application/regle-categorisation-repository";
import type { RegleCategorisation } from "../../regles-categorisation/domain/regle-categorisation";

// Stub regle repo : `list` renvoie les règles fournies (les autres méthodes ne sont pas appelées ici).
function stubRegleRepo(regles: RegleCategorisation[]): IRegleCategorisationRepository {
  return {
    list: async () => regles,
    getById: async () => null,
    create: async () => { throw new Error("n/a"); },
    update: async () => null,
    delete: async () => false,
  };
}
const regle = (motifLibelle: string, categorie: string, actif = true): RegleCategorisation => ({ id: 1, artisanId: 1, motifLibelle, categorie, actif, createdAt: new Date() });

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const seed = (repo: FakeTransactionBancaireRepository, over: Partial<Parameters<FakeTransactionBancaireRepository["seed"]>[0]> = {}) =>
  repo.seed({
    artisanId: 1,
    releveId: null,
    dateTransaction: "2026-06-15",
    libelle: "Achat",
    montant: "120.00",
    typeTransaction: "debit",
    categorieSuggeree: null,
    depenseId: null,
    ignoree: false,
    ...over,
  });

describe("depenses — transactions bancaires use-cases", () => {
  it("getTransactionsBancaires : non ignorées du tenant, récentes d'abord", async () => {
    const repo = new FakeTransactionBancaireRepository();
    seed(repo, { dateTransaction: "2026-06-10", libelle: "Vieux" });
    seed(repo, { dateTransaction: "2026-06-20", libelle: "Recent" });
    seed(repo, { dateTransaction: "2026-06-25", ignoree: true, libelle: "Ignoree" });
    seed(repo, { artisanId: 2, dateTransaction: "2026-06-22", libelle: "ChezB" }); // autre tenant
    const list = await getTransactionsBancaires(repo, A);
    expect(list.map((t) => t.libelle)).toEqual(["Recent", "Vieux"]); // ignorée + B exclues, tri desc
    // isolation : B ne voit que les siennes
    expect((await getTransactionsBancaires(repo, B)).map((t) => t.libelle)).toEqual(["ChezB"]);
  });

  it("getTransactionsBancaires : filtre par relevé", async () => {
    const repo = new FakeTransactionBancaireRepository();
    seed(repo, { releveId: 5, libelle: "R5" });
    seed(repo, { releveId: 9, libelle: "R9" });
    expect((await getTransactionsBancaires(repo, A, 5)).map((t) => t.libelle)).toEqual(["R5"]);
  });

  it("ignorerTransaction : marque ignorée (scopé tenant) → disparaît de la liste ; idempotent", async () => {
    const repo = new FakeTransactionBancaireRepository();
    const t = seed(repo, { libelle: "AIgnorer" });
    expect(await ignorerTransaction(repo, A, t.id)).toEqual({ success: true });
    expect(await getTransactionsBancaires(repo, A)).toEqual([]);
    // idempotent
    await ignorerTransaction(repo, A, t.id);
    // cross-tenant : B ne peut pas ignorer la transaction de A (no-op)
    const t2 = seed(repo, { libelle: "DeA" });
    await ignorerTransaction(repo, B, t2.id);
    expect((await getTransactionsBancaires(repo, A)).some((x) => x.id === t2.id)).toBe(true);
  });
});

describe("depenses — suggererCategorie (pur)", () => {
  it("match le 1er motif (règle active) contenu dans le libellé (insensible à la casse)", () => {
    const regles = [regle("carrefour", "alimentation"), regle("total", "carburant"), regle("loyer", "immobilier", false)];
    expect(suggererCategorie("PAIEMENT CARREFOUR CITY", regles)).toBe("alimentation");
    expect(suggererCategorie("STATION TOTAL ACCESS", regles)).toBe("carburant");
    expect(suggererCategorie("VIREMENT LOYER", regles)).toBeNull(); // règle inactive ignorée
    expect(suggererCategorie("INCONNU", regles)).toBeNull();
  });
});

describe("depenses — importReleve", () => {
  it("parse + enrichit (catégorie suggérée) + insère ; CSV vide → message", async () => {
    const repo = new FakeTransactionBancaireRepository();
    const csv = "date;libelle;montant\n15/06/2026;CARREFOUR CITY;-42,50\n20/06/2026;DIVERS;-10,00";
    const res = await importReleve({ transactionRepo: repo, regleRepo: stubRegleRepo([regle("carrefour", "alimentation")]) }, A, { nomFichier: "juin.csv", contenuCsv: csv });
    expect(res.nbImportees).toBe(2);
    expect(res.releveId).toBeGreaterThan(0);
    const list = await getTransactionsBancaires(repo, A, res.releveId);
    const carrefour = list.find((t) => t.libelle === "CARREFOUR CITY");
    expect(carrefour?.categorieSuggeree).toBe("alimentation");
    expect(carrefour?.montant).toBe("42.5"); // stocké en valeur absolue
    expect(list.find((t) => t.libelle === "DIVERS")?.categorieSuggeree).toBeNull();
    // CSV invalide
    expect(await importReleve({ transactionRepo: repo, regleRepo: stubRegleRepo([]) }, A, { nomFichier: "x", contenuCsv: "" })).toMatchObject({ releveId: 0, nbImportees: 0 });
  });

  it("> 5000 lignes → ValidationError (anti-DoS)", async () => {
    const repo = new FakeTransactionBancaireRepository();
    const csv = ["date;libelle;montant", ...Array.from({ length: 5001 }, (_, i) => `15/06/2026;L${i};-1`)].join("\n");
    await expect(importReleve({ transactionRepo: repo, regleRepo: stubRegleRepo([]) }, A, { nomFichier: "x", contenuCsv: csv })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("depenses — convertirTransaction", () => {
  it("crée une dépense (TVA 20% dérivée du TTC), lie la transaction, idempotent", async () => {
    const trxRepo = new FakeTransactionBancaireRepository();
    const depRepo = new FakeDepenseRepository();
    const t = seed(trxRepo, { libelle: "FOURNITURES X", montant: "120.00", typeTransaction: "debit" });
    const dep = await convertirTransaction({ transactionRepo: trxRepo, depenseRepo: depRepo }, A, { transactionId: t.id, categorie: "materiaux" });
    expect(dep.montantTtc).toBe("120.00");
    expect(dep.montantHt).toBe("100.00"); // 120 / 1.2
    expect(dep.montantTva).toBe("20.00");
    expect(dep.fournisseur).toBe("FOURNITURES X"); // libellé par défaut
    expect(dep.numero).toMatch(/^DEP-/);
    // transaction liée → re-conversion refusée (idempotence anti double-dépense)
    expect((await trxRepo.getById(A, t.id))?.depenseId).toBe(dep.id);
    await expect(convertirTransaction({ transactionRepo: trxRepo, depenseRepo: depRepo }, A, { transactionId: t.id, categorie: "materiaux" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("transaction inexistante / autre tenant → NotFound", async () => {
    const trxRepo = new FakeTransactionBancaireRepository();
    const depRepo = new FakeDepenseRepository();
    const t = seed(trxRepo, { montant: "50.00" });
    await expect(convertirTransaction({ transactionRepo: trxRepo, depenseRepo: depRepo }, A, { transactionId: 999999, categorie: "x" })).rejects.toBeInstanceOf(NotFoundError);
    // B ne voit pas la transaction de A
    await expect(convertirTransaction({ transactionRepo: trxRepo, depenseRepo: depRepo }, B, { transactionId: t.id, categorie: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("une transaction au CRÉDIT (encaissement) → ValidationError (pas une dépense)", async () => {
    const trxRepo = new FakeTransactionBancaireRepository();
    const depRepo = new FakeDepenseRepository();
    const t = seed(trxRepo, { libelle: "VIREMENT RECU", montant: "300.00", typeTransaction: "credit" });
    await expect(
      convertirTransaction({ transactionRepo: trxRepo, depenseRepo: depRepo }, A, { transactionId: t.id, categorie: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
    // non liée → pas de dépense fictive créée
    expect((await trxRepo.getById(A, t.id))?.depenseId).toBeNull();
  });
});
