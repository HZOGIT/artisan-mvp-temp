import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { RapportRepositoryDrizzle } from "./rapport-repository-drizzle";
import { executerRapport } from "../application/use-cases";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9940001;
const B = 9940002;
const UA = 9940003;
const UB = 9940004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("RapportRepositoryDrizzle (PG, RLS + scope tenant + executer)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new RapportRepositoryDrizzle(app.db);
  let clientA = 0;

  const cleanup = async () => {
    await admin.query('delete from executions_rapports where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from rapports_personnalises where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from factures where "artisanId" in ($1,$2)', [A, B]);
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
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "Client A"])).rows[0].id;
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalHT") values ($1,$2,$3,$4,$5)', [A, clientA, "RAP-A1", "payee", "400.00"]);
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5)', [A, clientA, "RAP-A2", "envoyee", "100.00"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + list + toggleFavori scopés tenant", async () => {
    const r = await repo.create(ctx(A), { nom: "Ventes A", type: "ventes" });
    expect(r.favori).toBe(false);
    const fav = await repo.toggleFavori(ctx(A), r.id);
    expect(fav?.favori).toBe(true);
    expect((await repo.list(ctx(A))).some((x) => x.id === r.id)).toBe(true);
    // Cross-tenant : B ne voit pas, ne toggle pas.
    expect(await repo.getById(ctx(B), r.id)).toBeNull();
    expect(await repo.toggleFavori(ctx(B), r.id)).toBeNull();
    expect(await repo.remove(ctx(B), r.id)).toBe(false);
  });

  it("executer 'ventes' : renvoie les factures de A + journalise l'exécution (RLS)", async () => {
    const r = await repo.create(ctx(A), { nom: "R ventes", type: "ventes" });
    const res = await executerRapport(repo, ctx(A), r.id, { p: 1 }, () => 0);
    expect(res.nombreLignes).toBe(2);
    const execs = await admin.query('select "nombreLignes" from executions_rapports where "rapportId"=$1', [r.id]);
    expect(execs.rowCount).toBe(1);
    expect(execs.rows[0].nombreLignes).toBe(2);
  });

  it("executer 'financier' : agrégat CA payé (400) scopé tenant", async () => {
    const r = await repo.create(ctx(A), { nom: "R fin", type: "financier" });
    const res = await executerRapport(repo, ctx(A), r.id, undefined, () => 0);
    expect(res.resultats).toEqual([{ totalCA: 400, nombreFactures: 2, facturesPayees: 1 }]);
  });

  it("remove : supprime le rapport et ses exécutions (cascade)", async () => {
    const r = await repo.create(ctx(A), { nom: "À jeter", type: "clients" });
    await executerRapport(repo, ctx(A), r.id, undefined, () => 0);
    expect(await repo.remove(ctx(A), r.id)).toBe(true);
    const execs = await admin.query('select id from executions_rapports where "rapportId"=$1', [r.id]);
    expect(execs.rowCount).toBe(0);
  });
});
