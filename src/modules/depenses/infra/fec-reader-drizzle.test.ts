import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { FecReaderDrizzle } from "./fec-reader-drizzle";
import { genererFecAchats } from "../application/fec";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 994301;
const B = 994302;
const UA = 994311;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;

describe.skipIf(!URL)("FecReaderDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new FecReaderDrizzle(app.db);

  const cleanup = async () => {
    await admin.query("delete from depenses where artisan_id in ($1,$2)", [A, B]);
    await admin.query('delete from configurations_comptables where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from users where id=$1", [UA]);
  };
  const seedDep = (artisanId: number, date: string, ht: string, tva: string, ttc: string, deductible: boolean) =>
    admin.query(
      "insert into depenses (artisan_id,user_id,numero,date_depense,categorie,montant_ht,montant_tva,montant_ttc,tva_deductible) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [artisanId, UA, `DEP-${artisanId}-${++seq}`, date, "materiaux", ht, tva, ttc, deductible],
    );

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("listDepensesDeductibles : période + tva_deductible, scopé tenant ; config par défaut", async () => {
    await seedDep(A, "2026-04-10", "100.00", "20.00", "120.00", true);
    await seedDep(A, "2026-04-25", "50.00", "10.00", "60.00", true);
    await seedDep(A, "2026-04-15", "999.00", "0.00", "999.00", false); // non déductible → exclue
    await seedDep(A, "2026-07-01", "200.00", "40.00", "240.00", true); // hors période
    await seedDep(B, "2026-04-12", "777.00", "0.00", "777.00", true); // autre tenant
    const deps = await reader.listDepensesDeductibles(ctx(A), "2026-04-01", "2026-04-30");
    expect(deps.map((d) => d.montantHt)).toEqual(["100.00", "50.00"]); // triées par date
    // config par défaut (aucune config enregistrée)
    const config = await reader.getConfigComptable(ctx(A));
    expect(config).toEqual({ compteAchats: "607000", compteTVADeductible: "445660", compteFournisseurs: "401000", journalAchats: "AC" });
    // FEC équilibré (débit = crédit)
    const fec = genererFecAchats(deps, config);
    const total = (col: number) => fec.split("\n").slice(1).reduce((s, l) => s + Number((l.split("\t")[col] || "0").replace(",", ".")), 0);
    expect(total(11)).toBeCloseTo(total(12), 2); // 180 == 180
    // isolation : B ne voit pas A
    expect(await reader.listDepensesDeductibles(ctx(B), "2026-04-01", "2026-04-30")).toHaveLength(1);
  });

  it("getConfigComptable : config personnalisée lue", async () => {
    await admin.query(
      'insert into configurations_comptables ("artisanId","compteAchats","compteTVADeductible","compteFournisseurs","journalAchats") values ($1,$2,$3,$4,$5)',
      [A, "601000", "445662", "401100", "HA"],
    );
    expect(await reader.getConfigComptable(ctx(A))).toEqual({ compteAchats: "601000", compteTVADeductible: "445662", compteFournisseurs: "401100", journalAchats: "HA" });
  });
});
