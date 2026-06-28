import { describe, it, expect } from "vitest";
import { scorerCandidats, rapprocher } from "./lettrage-use-cases";
import type { FactureImpayeeItem } from "./facture-lettreur-port";
import { FakeTransactionBancaireRepository } from "../infra/transaction-bancaire-repository-fake";
import type { IFactureLettrerPort } from "./facture-lettreur-port";
import type { TenantContext } from "../../../shared/tenant";
import { ConflictError, ValidationError } from "../../../shared/errors";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

const makeFacture = (overrides: Partial<FactureImpayeeItem> = {}): FactureImpayeeItem => ({
  id: 1,
  totalTTC: "1200.00",
  dateFacture: new Date("2026-06-01"),
  numero: "FA-001",
  nomClient: "Client Martin",
  ...overrides,
});

/** L1 — scorerCandidats (fonction pure) */
describe("scorerCandidats", () => {
  it("retourne vide si aucune facture ne correspond (tolérance ±10%)", () => {
    const factures = [makeFacture({ totalTTC: "2000.00" })];
    expect(scorerCandidats(1000, "2026-06-15", factures)).toEqual([]);
  });

  it("accepte un montant dans la tolérance ±10%", () => {
    const factures = [makeFacture({ totalTTC: "1100.00" })];
    const result = scorerCandidats(1000, "2026-06-15", factures);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeGreaterThan(0);
  });

  it("montant exact > score montant approché", () => {
    const exact = makeFacture({ id: 1, totalTTC: "1000.00" });
    const approche = makeFacture({ id: 2, totalTTC: "950.00" });
    const result = scorerCandidats(1000, "2026-06-15", [approche, exact]);
    expect(result[0].id).toBe(1);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("date proche booste le score", () => {
    const proche = makeFacture({ id: 1, totalTTC: "1100.00", dateFacture: new Date("2026-06-14") });
    const loin = makeFacture({ id: 2, totalTTC: "1100.00", dateFacture: new Date("2026-01-01") });
    const result = scorerCandidats(1000, "2026-06-15", [loin, proche]);
    expect(result[0].id).toBe(1);
  });

  it("retourne au maximum 5 candidats", () => {
    const factures = Array.from({ length: 10 }, (_, i) =>
      makeFacture({ id: i + 1, totalTTC: "1000.00" }),
    );
    expect(scorerCandidats(1000, "2026-06-15", factures)).toHaveLength(5);
  });

  it("ignore les factures à totalTTC ≤ 0", () => {
    expect(scorerCandidats(100, "2026-06-15", [makeFacture({ totalTTC: "0.00" })])).toEqual([]);
  });
});

/** L1 — rapprocher (avec fakes) */
describe("rapprocher", () => {
  const makeLettreur = (overrides: Partial<IFactureLettrerPort> = {}): IFactureLettrerPort => ({
    listImpayees: async () => [],
    payer: async () => {},
    ...overrides,
  });

  it("rapproche : payer appelé + factureId posé", async () => {
    let payerCalledWith: { factureId: number; montantPaye: string } | null = null;
    const repo = new FakeTransactionBancaireRepository();
    const t = repo.seed({ artisanId: 1, releveId: null, dateTransaction: "2026-06-10", libelle: "VIR", montant: "1000.00", typeTransaction: "credit", categorieSuggeree: null, depenseId: null, ignoree: false });
    const lettreur = makeLettreur({
      payer: async (_ctx, factureId, montantPaye) => { payerCalledWith = { factureId, montantPaye }; },
    });
    await rapprocher({ transactionRepo: repo, lettreur }, ctx, { transactionId: t.id, factureId: 42 });
    expect(payerCalledWith).toEqual({ factureId: 42, montantPaye: "1000.00" });
    expect((await repo.getById(ctx, t.id))?.factureId).toBe(42);
  });

  it("idempotent : même factureId → no-op (payer non rappelé)", async () => {
    let calls = 0;
    const repo = new FakeTransactionBancaireRepository();
    const t = repo.seed({ artisanId: 1, releveId: null, dateTransaction: "2026-06-10", libelle: "VIR", montant: "500.00", typeTransaction: "credit", categorieSuggeree: null, depenseId: null, ignoree: false, factureId: 99 });
    const lettreur = makeLettreur({ payer: async () => { calls++; } });
    await rapprocher({ transactionRepo: repo, lettreur }, ctx, { transactionId: t.id, factureId: 99 });
    expect(calls).toBe(0);
  });

  it("erreur si transaction déjà rapprochée à une autre facture", async () => {
    const repo = new FakeTransactionBancaireRepository();
    const t = repo.seed({ artisanId: 1, releveId: null, dateTransaction: "2026-06-10", libelle: "VIR", montant: "500.00", typeTransaction: "credit", categorieSuggeree: null, depenseId: null, ignoree: false, factureId: 11 });
    await expect(rapprocher({ transactionRepo: repo, lettreur: makeLettreur() }, ctx, { transactionId: t.id, factureId: 22 })).rejects.toThrow(ConflictError);
  });

  it("erreur si transaction au débit", async () => {
    const repo = new FakeTransactionBancaireRepository();
    const t = repo.seed({ artisanId: 1, releveId: null, dateTransaction: "2026-06-10", libelle: "ACH", montant: "200.00", typeTransaction: "debit", categorieSuggeree: null, depenseId: null, ignoree: false });
    await expect(rapprocher({ transactionRepo: repo, lettreur: makeLettreur() }, ctx, { transactionId: t.id, factureId: 1 })).rejects.toThrow(ValidationError);
  });

  it("erreur si transaction introuvable / hors tenant", async () => {
    const repo = new FakeTransactionBancaireRepository();
    const autre: TenantContext = { artisanId: 2, userId: 1 };
    const t = repo.seed({ artisanId: 2, releveId: null, dateTransaction: "2026-06-10", libelle: "VIR", montant: "100.00", typeTransaction: "credit", categorieSuggeree: null, depenseId: null, ignoree: false });
    await expect(rapprocher({ transactionRepo: repo, lettreur: makeLettreur() }, ctx, { transactionId: t.id, factureId: 1 })).rejects.toThrow("Transaction introuvable");
    void autre;
  });
});
