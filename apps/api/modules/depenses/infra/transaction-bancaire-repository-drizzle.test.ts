import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { TransactionBancaireRepositoryDrizzle } from "./transaction-bancaire-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 994201;
const B = 994202;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("TransactionBancaireRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new TransactionBancaireRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query("delete from transactions_bancaires where artisan_id in ($1,$2)", [A, B]);
    await admin.query("delete from releves_bancaires where artisan_id in ($1,$2)", [A, B]);
  };
  const seed = (artisanId: number, over: Partial<{ date: string; libelle: string; montant: string; type: string; releve: number | null; ignoree: boolean }> = {}) =>
    admin.query(
      "insert into transactions_bancaires (artisan_id,releve_id,date_transaction,libelle,montant,type_transaction,ignoree) values ($1,$2,$3,$4,$5,$6,$7) returning id",
      [artisanId, over.releve ?? null, over.date ?? "2026-06-15", over.libelle ?? "Achat", over.montant ?? "120.00", over.type ?? "debit", over.ignoree ?? false],
    );

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("list : non ignorées du tenant, récentes d'abord (RLS)", async () => {
    await seed(A, { date: "2026-06-10", libelle: "Vieux" });
    await seed(A, { date: "2026-06-20", libelle: "Recent" });
    await seed(A, { date: "2026-06-25", libelle: "Ignoree", ignoree: true });
    await seed(B, { date: "2026-06-22", libelle: "ChezB" });
    const list = await repo.list(ctx(A));
    expect(list.map((t) => t.libelle)).toEqual(["Recent", "Vieux"]);
    expect(list[0].montant).toBe("120.00");
    expect(list[0].typeTransaction).toBe("debit");
    // isolation : B
    expect((await repo.list(ctx(B))).map((t) => t.libelle)).toEqual(["ChezB"]);
  });

  it("list : filtre par relevé", async () => {
    await seed(A, { releve: 777, libelle: "R777" });
    const list = await repo.list(ctx(A), 777);
    expect(list.map((t) => t.libelle)).toEqual(["R777"]);
  });

  it("ignorer : marque ignorée (scopé tenant) → exclue de list ; cross-tenant no-op", async () => {
    const { rows } = await seed(A, { libelle: "AIgnorer" });
    const id = rows[0].id as number;
    // B ne peut pas ignorer la transaction de A
    await repo.ignorer(ctx(B), id);
    expect((await repo.list(ctx(A))).some((t) => t.id === id)).toBe(true);
    // A l'ignore → disparaît
    await repo.ignorer(ctx(A), id);
    expect((await repo.list(ctx(A))).some((t) => t.id === id)).toBe(false);
  });

  it("createReleve : crée le relevé + insère les transactions (montant ABS), scopé tenant", async () => {
    const res = await repo.createReleve(ctx(A), "fevrier.csv", [
      { dateTransaction: "2026-02-10", libelle: "ACHAT 1", montant: -50.5, typeTransaction: "debit", categorieSuggeree: "materiaux" },
      { dateTransaction: "2026-02-12", libelle: "REMB", montant: 100, typeTransaction: "credit", categorieSuggeree: null },
    ]);
    expect(res.nbImportees).toBe(2);
    expect(res.releveId).toBeGreaterThan(0);
    const list = await repo.list(ctx(A), res.releveId);
    expect(list.map((t) => t.libelle).sort()).toEqual(["ACHAT 1", "REMB"]);
    const achat = list.find((t) => t.libelle === "ACHAT 1");
    expect(achat?.montant).toBe("50.50"); // valeur absolue, scale 2
    expect(achat?.categorieSuggeree).toBe("materiaux");
    // relevé marqué terminé
    const [rel] = (await admin.query("select statut, nb_importees from releves_bancaires where id=$1", [res.releveId])).rows;
    expect(rel.statut).toBe("termine");
    expect(rel.nb_importees).toBe(2);
    // isolation : B ne voit pas ce relevé
    expect(await repo.list(ctx(B), res.releveId)).toEqual([]);
  });

  it("getById + lierDepense : scopé tenant", async () => {
    const { rows } = await seed(A, { libelle: "ALier" });
    const id = rows[0].id as number;
    expect((await repo.getById(ctx(A), id))?.libelle).toBe("ALier");
    expect(await repo.getById(ctx(B), id)).toBeNull(); // cross-tenant
    await repo.lierDepense(ctx(A), id, 4242);
    expect((await repo.getById(ctx(A), id))?.depenseId).toBe(4242);
    // B ne peut pas relier
    await repo.lierDepense(ctx(B), id, 9999);
    expect((await repo.getById(ctx(A), id))?.depenseId).toBe(4242);
  });

  it("lierFacture : factureId persiste + isolation RLS (B ne peut pas lier)", async () => {
    const { rows } = await seed(A, { libelle: "CreditA", type: "credit" });
    const id = rows[0].id as number;
    /** factureId null par défaut */
    expect((await repo.getById(ctx(A), id))?.factureId).toBeNull();
    /** B ne peut pas lier */
    await repo.lierFacture(ctx(B), id, 777);
    expect((await repo.getById(ctx(A), id))?.factureId).toBeNull();
    /** A lie la transaction à une facture fictive (FK non vérifiée ici : FK dans la migration) */
    await admin.query("insert into factures (\"artisanId\",\"clientId\",\"dateFacture\",statut,\"totalHT\",\"totalTVA\",\"totalTTC\",\"montantPaye\") values ($1,0,now(),'envoyee','100.00','20.00','120.00','0.00') returning id", [A]);
    const { rows: fRows } = await admin.query("select id from factures where \"artisanId\"=$1 order by id desc limit 1", [A]);
    const fid = (fRows[0] as { id: number }).id;
    await repo.lierFacture(ctx(A), id, fid);
    expect((await repo.getById(ctx(A), id))?.factureId).toBe(fid);
    /** idempotent : re-lier à la même facture ne lève pas d'erreur */
    await repo.lierFacture(ctx(A), id, fid);
    expect((await repo.getById(ctx(A), id))?.factureId).toBe(fid);
  });

  it("listCreditsNonRapproches : exclut débits, rapprochés, ignorés ; isolation RLS", async () => {
    /** seed : crédit non rapproché A */
    await seed(A, { type: "credit", libelle: "CREDIT_A" });
    /** crédit rapproché (factureId non null) */
    const { rows: fRows } = await admin.query(
      "insert into factures (\"artisanId\",\"clientId\",\"dateFacture\",statut,\"totalHT\",\"totalTVA\",\"totalTTC\",\"montantPaye\") values ($1,0,now(),'payee','100.00','20.00','120.00','120.00') returning id",
      [A],
    );
    const fid = (fRows[0] as { id: number }).id;
    const { rows: tRows } = await seed(A, { type: "credit", libelle: "RAPPROCHE_A" });
    const tid = (tRows[0] as { id: number }).id;
    await admin.query("update transactions_bancaires set facture_id=$1 where id=$2", [fid, tid]);
    /** débit : exclu */
    await seed(A, { type: "debit", libelle: "DEBIT_A" });
    /** ignoré : exclu */
    await seed(A, { type: "credit", libelle: "IGNORE_A", ignoree: true });
    /** crédit non rapproché de B : exclu par RLS */
    await seed(B, { type: "credit", libelle: "CREDIT_B" });

    const credits = await repo.listCreditsNonRapproches(ctx(A));
    const libelles = credits.map((t) => t.libelle);
    expect(libelles).toContain("CREDIT_A");
    expect(libelles).not.toContain("RAPPROCHE_A");
    expect(libelles).not.toContain("DEBIT_A");
    expect(libelles).not.toContain("IGNORE_A");
    expect(libelles).not.toContain("CREDIT_B");
    /** factureId exposé */
    const t = await repo.getById(ctx(A), tid);
    expect(t?.factureId).toBe(fid);
  });
});
