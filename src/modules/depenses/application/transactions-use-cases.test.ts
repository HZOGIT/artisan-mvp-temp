import { describe, it, expect } from "vitest";
import { FakeTransactionBancaireRepository } from "../infra/transaction-bancaire-repository-fake";
import { getTransactionsBancaires, ignorerTransaction } from "./transactions-use-cases";
import type { TenantContext } from "../../../shared/tenant";

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
