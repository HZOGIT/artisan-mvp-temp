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
    // Factures de A : 1 payée (mois courant) + 1 impayée.
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC","datePaiement") values ($1,$2,$3,$4,$5,now())', [A, clientA, "DASH-A1", "payee", "300.00"]);
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5)', [A, clientA, "DASH-A2", "envoyee", "120.00"]);
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC","datePaiement") values ($1,$2,$3,$4,$5,now())', [B, clientB, "DASH-B1", "payee", "9999.00"]);
    // Devis de A : 2 (1 en cours).
    await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4)', [A, clientA, "DASH-DA1", "envoye"]);
    await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4)', [A, clientA, "DASH-DA2", "accepte"]);
    // Intervention à venir de A (dans 2 jours).
    await admin.query(`insert into interventions ("artisanId","clientId",titre,statut,"dateDebut") values ($1,$2,$3,$4, now() + interval '2 days')`, [A, clientA, "Visite proche", "planifiee"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getStats(A) : scopé tenant, B exclu (caYear 300, 1 impayée=120, devisEnCours 1)", async () => {
    const s = await getStats(reader, ctx(A));
    expect(s.totalFactures).toBe(2);
    expect(s.caYear).toBe(300);
    expect(s.caMonth).toBe(300);
    expect(s.facturesImpayees).toEqual({ count: 1, total: 120 });
    expect(s.devisEnCours).toBe(1);
    expect(s.totalDevis).toBe(2);
    expect(s.interventionsAVenir).toBe(1);
    expect(s.totalClients).toBe(1);
  });

  it("isolation : getStats(B) ne voit que ses données (CA 9999)", async () => {
    const s = await getStats(reader, ctx(B));
    expect(s.totalFactures).toBe(1);
    expect(s.caYear).toBe(9999);
  });

  it("getTopClients(A) + getUpcomingInterventions(A) : scopés tenant, client joint", async () => {
    const top = await getTopClients(reader, ctx(A), 5);
    expect(top[0].client.id).toBe(clientA);
    expect(top[0].totalCA).toBe(420); // 300 + 120

    const upcoming = await getUpcomingInterventions(reader, ctx(A));
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].titre).toBe("Visite proche");
    expect(upcoming[0].client?.prenom).toBe("Jean");
  });
});
