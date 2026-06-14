import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { FacturesCAReaderDrizzle } from "./factures-ca-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9946501;
const B = 9946502;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("FacturesCAReaderDrizzle (agrégat CA factures payées, RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new FacturesCAReaderDrizzle(app.db);
  let clientA1 = 0;
  let clientA2 = 0;
  let clientB = 0;

  const cleanup = async () => {
    await admin.query('delete from factures where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(async () => {
    await cleanup();
    clientA1 = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "CA1"])).rows[0].id;
    clientA2 = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "CA2"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "CB"])).rows[0].id;
    const f = (artisanId: number, clientId: number, statut: string, ttc: string, date: string) =>
      admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC","dateFacture") values ($1,$2,$3,$4,$5,$6)', [
        artisanId, clientId, `F-${A}-${Math.random().toString(36).slice(2, 8)}`, statut, ttc, date,
      ]);
    // A, janvier 2025 : 2 factures payées (clients distincts) + 1 NON payée (exclue)
    await f(A, clientA1, "payee", "1000.00", "2025-01-10");
    await f(A, clientA2, "payee", "500.00", "2025-01-20");
    await f(A, clientA1, "envoyee", "9999.00", "2025-01-25"); // pas payée → exclue
    // A, février 2025 : 1 payée
    await f(A, clientA1, "payee", "800.00", "2025-02-05");
    // B, janvier 2025 : payée (ne doit pas apparaître pour A)
    await f(B, clientB, "payee", "7777.00", "2025-01-15");
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("agrège par mois/année les factures PAYÉES, scopé tenant (clients distincts)", async () => {
    const rows = await reader.aggregatePaidByMonth(ctx(A));
    const jan = rows.find((r) => r.mois === 1 && r.annee === 2025);
    const fev = rows.find((r) => r.mois === 2 && r.annee === 2025);
    expect(jan).toBeDefined();
    expect(parseFloat(jan!.caTotal)).toBe(1500); // 1000 + 500 (la 9999 envoyée exclue)
    expect(jan!.nombreFactures).toBe(2);
    expect(jan!.nombreClients).toBe(2);
    expect(parseFloat(fev!.caTotal)).toBe(800);
    expect(fev!.nombreFactures).toBe(1);
    // isolation : la facture de B (7777) n'est pas comptée pour A
    expect(rows.every((r) => parseFloat(r.caTotal) !== 7777)).toBe(true);
    // B voit la sienne uniquement
    const rowsB = await reader.aggregatePaidByMonth(ctx(B));
    expect(rowsB).toHaveLength(1);
    expect(parseFloat(rowsB[0].caTotal)).toBe(7777);
  });
});
