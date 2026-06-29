import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DashboardReaderDrizzle } from "./dashboard-reader-drizzle";
import { getStats, getTopClients, getUpcomingInterventions } from "../application/use-cases";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9939001;
const B = 9939002;
const UA = 9939003;
const UB = 9939004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("DashboardReaderDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new DashboardReaderDrizzle(app.db);
  let clientA = 0;

  const cleanup = async () => {
    await admin.query('delete from factures where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from devis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from interventions where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from artisans where id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [A, UA]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [B, UB]);
    clientA = (await admin.query('insert into clients ("artisanId",nom,prenom) values ($1,$2,$3) returning id', [A, "Alpha", "Jean"])).rows[0].id;
    const clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "Beta"])).rows[0].id;
    /** Facture A1 : payée ce mois — totalHT=300 (pour CA) + totalTTC=360 */
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalHT","totalTTC","datePaiement") values ($1,$2,$3,$4,$5,$6,now())', [A, clientA, "DASH-A1", "payee", "300.00", "360.00"]);
    /** Facture A2 : envoyée (impayée) — totalTTC=120 */
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5)', [A, clientA, "DASH-A2", "envoyee", "120.00"]);
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalHT","totalTTC","datePaiement") values ($1,$2,$3,$4,$5,$6,now())', [B, clientB, "DASH-B1", "payee", "9999.00", "11998.80"]);
    /** Devis de A : 2 (1 en cours). */
    await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4)', [A, clientA, "DASH-DA1", "envoye"]);
    await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4)', [A, clientA, "DASH-DA2", "accepte"]);
    /** Intervention à venir de A (dans 2 jours). */
    await admin.query(`insert into interventions ("artisanId","clientId",titre,statut,"dateDebut") values ($1,$2,$3,$4, now() + interval '2 days')`, [A, clientA, "Visite proche", "planifiee"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getSummaryStats(A) : agrégats SQL scopés tenant, B exclu", async () => {
    const s = await reader.getSummaryStats(ctx(A));
    expect(s.totalFactures).toBe(2);
    expect(s.caYear).toBeCloseTo(300, 1);
    expect(s.caMonth).toBeCloseTo(300, 1);
    expect(s.facturesImpayeesCount).toBe(1);
    expect(s.facturesImpayeesTotal).toBeCloseTo(120, 1);
    expect(s.devisEnCours).toBe(1);
    expect(s.devisAcceptes).toBe(1);
    expect(s.totalDevis).toBe(2);
    expect(s.interventionsAVenir).toBe(1);
    expect(s.totalClients).toBe(1);
  });

  it("getSummaryStats(B) : isolation tenant (CA 9999)", async () => {
    const s = await reader.getSummaryStats(ctx(B));
    expect(s.totalFactures).toBe(1);
    expect(s.caYear).toBeCloseTo(9999, 1);
  });

  it("getStats(A) via use-case : délègue à getSummaryStats", async () => {
    const s = await getStats(reader, ctx(A));
    expect(s.totalFactures).toBe(2);
    expect(s.caYear).toBeCloseTo(300, 1);
    expect(s.caMonth).toBeCloseTo(300, 1);
    expect(s.facturesImpayees).toMatchObject({ count: 1, total: expect.closeTo(120, 1) });
    expect(s.devisEnCours).toBe(1);
    expect(s.totalDevis).toBe(2);
    expect(s.interventionsAVenir).toBe(1);
    expect(s.totalClients).toBe(1);
  });

  it("isolation : getStats(B) ne voit que ses données (CA 9999)", async () => {
    const s = await getStats(reader, ctx(B));
    expect(s.totalFactures).toBe(1);
    expect(s.caYear).toBeCloseTo(9999, 1);
  });

  it("getTopClients(A) + getUpcomingInterventions(A) : scopés tenant, client joint", async () => {
    const top = await getTopClients(reader, ctx(A), 5);
    expect(top[0].client.id).toBe(clientA);
    expect(top[0].totalCA).toBeCloseTo(300, 1); /** CA récent sur 12 mois — totalHT=300 (payée) + 0 (envoyée) */

    const upcoming = await getUpcomingInterventions(reader, ctx(A));
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].titre).toBe("Visite proche");
    expect(upcoming[0].client?.prenom).toBe("Jean");
  });
});
