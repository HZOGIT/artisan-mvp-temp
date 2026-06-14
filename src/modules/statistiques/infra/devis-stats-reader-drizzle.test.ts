import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DevisStatsReaderDrizzle } from "./devis-stats-reader-drizzle";
import { getDevisStats } from "../application/use-cases";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9934001;
const B = 9934002;
const UA = 9934003;
const UB = 9934004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("DevisStatsReaderDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new DevisStatsReaderDrizzle(app.db);
  let clientA = 0;

  const cleanup = async () => {
    await admin.query('delete from devis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "Client A"])).rows[0].id;
    const clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "Client B"])).rows[0].id;
    const ins = async (artisanId: number, clientId: number, numero: string, statut: string, ttc: string) =>
      admin.query('insert into devis ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5)', [artisanId, clientId, numero, statut, ttc]);
    await ins(A, clientA, "ST-A1", "accepte", "100.00");
    await ins(A, clientA, "ST-A2", "accepte", "200.50");
    await ins(A, clientA, "ST-A3", "brouillon", "50.00");
    await ins(B, clientB, "ST-B1", "envoye", "999.00");
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getDevisStats : agrégats scopés au tenant A (RLS), B non inclus", async () => {
    const stats = await getDevisStats(reader, ctx(A));
    expect(stats.total).toBe(3);
    expect(stats.parStatut).toEqual({ accepte: 2, brouillon: 1 });
    expect(stats.montantTotal).toBeCloseTo(350.5, 2);
  });

  it("isolation : le tenant B ne voit que ses propres devis", async () => {
    const stats = await getDevisStats(reader, ctx(B));
    expect(stats).toEqual({ total: 1, parStatut: { envoye: 1 }, montantTotal: 999 });
  });
});
