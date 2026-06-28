import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DevisReaderDrizzle } from "./devis-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9940021;
const B = 9940022;
const UA = 9940023;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("DevisReaderDrizzle — updateMontantDejaFacture (PG + RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new DevisReaderDrizzle(app.db);
  let clientA = 0;
  let devisA = 0;

  const cleanup = async () => {
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from devis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from users where id=$1", [UA]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "Client Situation"])).rows[0].id;
    devisA = (await admin.query(
      'insert into devis ("artisanId","clientId",numero,"totalHT","totalTVA","totalTTC","montantDejaFacture") values ($1,$2,$3,$4,$5,$6,$7) returning id',
      [A, clientA, "DEV-SIT-001", "1000.00", "200.00", "1200.00", "0.00"],
    )).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getDevis retourne montantDejaFacture initial à 0.00", async () => {
    const d = await reader.getDevis(ctx(A), devisA);
    expect(d).not.toBeNull();
    expect(d?.montantDejaFacture).toBe("0.00");
    expect(d?.totalTTC).toBe("1200.00");
  });

  it("updateMontantDejaFacture persiste la valeur + getDevis la relit", async () => {
    await reader.updateMontantDejaFacture(ctx(A), devisA, "360.00");
    const d = await reader.getDevis(ctx(A), devisA);
    expect(d?.montantDejaFacture).toBe("360.00");
  });

  it("isolation RLS : tenant B ne peut pas mettre à jour le devis de A", async () => {
    await reader.updateMontantDejaFacture(ctx(B), devisA, "9999.00");
    /** Le devis de A est inchangé (RLS empêche l'update du tenant B). */
    const d = await reader.getDevis(ctx(A), devisA);
    expect(d?.montantDejaFacture).toBe("360.00");
  });
});
