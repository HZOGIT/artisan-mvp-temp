import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { FacturesCsvReaderDrizzle } from "./factures-csv-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9950211;
const UID_B = 9950212;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : lecture des factures d'une période pour l'export CSV comptable. Scopé tenant (RLS + filtre
// artisanId) ; join client. Vérifie le filtre de période (bornes incluses), le tri par date, le nom
// client (fallback "Client"), et l'anti-IDOR cross-tenant.
describe.skipIf(!URL)("FacturesCsvReaderDrizzle (RLS export CSV période)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new FacturesCsvReaderDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    await admin.query(`delete from factures where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from clients where "artisanId" ${sub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Csv A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Csv B"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Lemoine"])).rows[0].id;
    const f = (numero: string, date: string) =>
      admin.query('insert into factures ("artisanId","clientId",numero,statut,"dateFacture","totalHT","totalTVA","totalTTC") values ($1,$2,$3,$4,$5,$6,$7,$8)', [artisanA, clientA, numero, "payee", date, "100.00", "20.00", "120.00"]);
    await f("CSV-AVANT", "2026-01-15"); // hors période (avant)
    await f("CSV-DEB", "2026-02-01"); // borne début (incluse)
    await f("CSV-MID", "2026-02-15");
    await f("CSV-FIN", "2026-02-28"); // borne fin (incluse)
    await f("CSV-APRES", "2026-03-10"); // hors période (après)
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("listFacturesPeriode : bornes incluses, tri par date asc, nom client", async () => {
    const rows = await reader.listFacturesPeriode(ctx(artisanA), { dateDebut: new Date("2026-02-01"), dateFin: new Date("2026-02-28") });
    expect(rows.map((r) => r.numero)).toEqual(["CSV-DEB", "CSV-MID", "CSV-FIN"]); // avant/après exclus, tri asc
    expect(rows[0].clientNom).toBe("Lemoine");
    expect(rows[0].totalTTC).toBe("120.00");
  });

  it("anti-IDOR : un autre tenant ne voit aucune facture de A", async () => {
    const rows = await reader.listFacturesPeriode(ctx(artisanB), { dateDebut: new Date("2026-02-01"), dateFin: new Date("2026-02-28") });
    expect(rows).toEqual([]);
  });
});
