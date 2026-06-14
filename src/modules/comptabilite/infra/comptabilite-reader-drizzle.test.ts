import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ComptabiliteReaderDrizzle } from "./comptabilite-reader-drizzle";
import { getBalance, getGrandLivre, getJournalVentes, getRapportTVA } from "../application/use-cases";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9942001;
const B = 9942002;
const UA = 9942003;
const UB = 9942004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const RANGE = { dateDebut: new Date("2026-06-01T00:00:00Z"), dateFin: new Date("2026-06-30T23:59:59Z") };

describe.skipIf(!URL)("ComptabiliteReaderDrizzle (PG, RLS + écritures équilibrées)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new ComptabiliteReaderDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from ecritures_comptables where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from artisans where id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [A, UA]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [B, UB]);
    const ec = (artisanId: number, journal: string, compte: string, lib: string, debit: string, credit: string) =>
      admin.query('insert into ecritures_comptables ("artisanId","dateEcriture",journal,"numeroCompte","libelleCompte",libelle,"pieceRef",debit,credit) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [artisanId, "2026-06-10T10:00:00Z", journal, compte, lib, "Facture F1", "F1", debit, credit]);
    // Facture A équilibrée : 411 débit 120 / 706 crédit 100 / 44571 crédit 20.
    await ec(A, "VE", "411000", "Clients", "120.00", "0.00");
    await ec(A, "VE", "706000", "Prestations", "0.00", "100.00");
    await ec(A, "VE", "445710", "TVA collectée 20%", "0.00", "20.00");
    // Tenant B : ne doit jamais apparaître pour A.
    await ec(B, "VE", "411000", "Clients", "9999.00", "0.00");
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getGrandLivre(A) : 3 comptes, scopé tenant ; B exclu", async () => {
    const gl = await getGrandLivre(reader, ctx(A), RANGE);
    expect(gl.map((c) => c.numeroCompte)).toEqual(["411000", "445710", "706000"]);
    expect(gl.find((c) => c.numeroCompte === "411000")?.solde).toBe(120);
  });

  it("getBalance(A) : INVARIANT Σ soldeDébiteur = Σ soldeCréditeur (écritures équilibrées)", async () => {
    const bal = await getBalance(reader, ctx(A), RANGE);
    const totDeb = bal.reduce((s, b) => s + b.soldeDebiteur, 0);
    const totCred = bal.reduce((s, b) => s + b.soldeCrediteur, 0);
    expect(totDeb).toBeCloseTo(120, 2);
    expect(totDeb).toBeCloseTo(totCred, 2);
  });

  it("getRapportTVA(A) : TVA collectée 20 (44571x crédit)", async () => {
    expect(await getRapportTVA(reader, ctx(A), RANGE)).toEqual({ tvaCollectee: 20, tvaDeductible: 0, tvaNette: 20 });
  });

  it("getJournalVentes(A) : 3 écritures VE ; isolation B ne voit que la sienne", async () => {
    expect(await getJournalVentes(reader, ctx(A), RANGE)).toHaveLength(3);
    const balB = await getBalance(reader, ctx(B), RANGE);
    expect(balB.find((b) => b.numeroCompte === "411000")?.debit).toBe(9999);
    expect(balB).toHaveLength(1);
  });
});
