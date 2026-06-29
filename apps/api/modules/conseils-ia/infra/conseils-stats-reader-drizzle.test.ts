import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ConseilsStatsReaderDrizzle } from "./conseils-stats-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9961051;
const UID_B = 9961052;

describe.skipIf(!URL)("ConseilsStatsReaderDrizzle (agrégats best-effort, scopés tenant sous RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new ConseilsStatsReaderDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;

  const cleanup = async () => {
    for (const uid of [UID_A, UID_B]) {
      await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from stocks where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
    }
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID_A])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID_B])).rows[0].id;
    const clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "C"])).rows[0].id;
    /* A : 2 devis en attente (brouillon+envoye), 1 accepté (exclu) ; 2 factures impayées (envoyee+en_retard),
       1 payée (exclue) ; 1 avoir envoyé (exclu du compteur impayées) ; 1 stock bas */
    await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4),($1,$2,$5,$6),($1,$2,$7,$8)', [artisanA, clientA, "D1", "brouillon", "D2", "envoye", "D3", "accepte"]);
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5),($1,$2,$6,$7,$8),($1,$2,$9,$10,$11)', [artisanA, clientA, "F1", "envoyee", "100.00", "F2", "en_retard", "50.00", "F3", "payee", "999.00"]);
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC","typeDocument") values ($1,$2,$3,$4,$5,$6)', [artisanA, clientA, "AV1", "envoyee", "30.00", "avoir"]);
    await admin.query('insert into stocks ("artisanId",reference,designation,"quantiteEnStock","seuilAlerte") values ($1,$2,$3,$4,$5),($1,$6,$7,$8,$9)', [artisanA, "R1", "Bas", "2.00", "5.00", "R2", "OK", "20.00", "5.00"]);
    // B : 1 devis en attente (isolation)
    const clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "C"])).rows[0].id;
    await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4)', [artisanB, clientB, "DB1", "envoye"]);
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("A : compte devis en attente (2), factures impayées (2, total 150 — avoir exclu), stocks bas (1)", async () => {
    const s = await reader.getStats({ artisanId: artisanA, userId: 0 });
    expect(s.nbDevisEnAttente).toBe(2);
    expect(s.nbFacturesImpayees).toBe(2);
    expect(s.montantImpayees).toBe(150);
    expect(s.nbStocksBas).toBe(1);
  });

  it("isolation : B ne voit que ses propres chiffres (1 devis, 0 facture/stock)", async () => {
    const s = await reader.getStats({ artisanId: artisanB, userId: 0 });
    expect(s.nbDevisEnAttente).toBe(1);
    expect(s.nbFacturesImpayees).toBe(0);
    expect(s.nbStocksBas).toBe(0);
  });
});
