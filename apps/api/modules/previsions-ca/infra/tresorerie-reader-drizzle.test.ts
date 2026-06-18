import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { TresorerieReaderDrizzle } from "./tresorerie-reader-drizzle";
import { computeTresorerie } from "../application/tresorerie-use-case";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9946601;
const B = 9946602;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("TresorerieReaderDrizzle (créances + avoirs + dépenses récurrentes, RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new TresorerieReaderDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;

  const cleanup = async () => {
    await admin.query('delete from factures where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from depenses where artisan_id in ($1,$2)", [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(async () => {
    await cleanup();
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "CA"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "CB"])).rows[0].id;
    const fac = (artisanId: number, clientId: number, statut: string, ttc: string, paye: string, ech: string | null, type = "facture") =>
      admin.query(
        'insert into factures ("artisanId","clientId",numero,statut,"typeDocument","totalTTC","montantPaye","dateEcheance") values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [artisanId, clientId, `F-${A}-${Math.random().toString(36).slice(2, 8)}`, statut, type, ttc, paye, ech],
      );
    // A : 1 créance (envoyee, reste 800), 1 soldée (ignorée), 1 avoir (300), 1 facture payée (pas créance)
    await fac(A, clientA, "envoyee", "1000.00", "200.00", "2026-01-15");
    await fac(A, clientA, "envoyee", "300.00", "300.00", "2026-01-20"); // soldée → reste 0
    await fac(A, clientA, "validee", "300.00", "0.00", null, "avoir");
    await fac(A, clientA, "payee", "999.00", "999.00", "2026-01-10"); // payée → pas créance
    // B : créance (ne doit pas apparaître pour A)
    await fac(B, clientB, "en_retard", "5000.00", "0.00", "2026-01-12");
    // A : dépense récurrente mensuelle
    await admin.query(
      "insert into depenses (artisan_id,user_id,numero,date_depense,categorie,montant_ht,montant_ttc,recurrente,frequence_recurrence,prochaine_occurrence) values ($1,1,$2,now(),$3,$4,$5,true,$6,$7)",
      [A, `DEP-${A}-1`, "loyer", "100.00", "120.00", "mensuelle", "2026-01-06"],
    );
    // A : dépense NON récurrente (ignorée)
    await admin.query(
      "insert into depenses (artisan_id,user_id,numero,date_depense,categorie,montant_ht,montant_ttc,recurrente) values ($1,1,$2,now(),$3,$4,$5,false)",
      [A, `DEP-${A}-2`, "materiel", "50.00", "60.00"],
    );
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("load : créances non soldées + avoirs + dépenses récurrentes, scopé tenant", async () => {
    const data = await reader.load(ctx(A));
    // créances : 2 lignes envoyée (la payée et l'avoir exclus de creances ; la soldée présente mais reste 0)
    expect(data.creances.length).toBe(2);
    expect(data.avoirsTotalTTC.map((s) => parseFloat(s))).toEqual([300]);
    expect(data.depensesRecurrentes).toHaveLength(1);
    expect(data.depensesRecurrentes[0].frequence).toBe("mensuelle");
    // isolation : B ne fuit pas (5000 absent)
    expect(data.creances.every((c) => parseFloat(c.totalTTC) !== 5000)).toBe(true);
    // bout-en-bout : 800 de créance − 300 d'avoir (netté) = 500 d'encaissement ; 120 de décaissement
    // (1 occurrence sur 4 sem) → net 380.
    const t = computeTresorerie(data, 4, new Date("2026-01-05T09:00:00Z"));
    expect(t.totalEntrees).toBe(500);
    expect(t.totalSorties).toBe(120);
    expect(t.totalNet).toBe(380);
    // B voit sa créance uniquement
    const dataB = await reader.load(ctx(B));
    expect(dataB.creances).toHaveLength(1);
    expect(parseFloat(dataB.creances[0].totalTTC)).toBe(5000);
  });
});
