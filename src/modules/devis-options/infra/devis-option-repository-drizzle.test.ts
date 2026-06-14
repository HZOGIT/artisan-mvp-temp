import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DevisOptionRepositoryDrizzle } from "./devis-option-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9931001;
const B = 9931002;
const UA = 9931003;
const UB = 9931004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("DevisOptionRepositoryDrizzle (PG, anti-IDOR via devis parent)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new DevisOptionRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;
  let devisA = 0;
  let devisB = 0;

  const cleanup = async () => {
    await admin.query('delete from devis_options_lignes where "optionId" in (select id from devis_options where "devisId" in (select id from devis where "artisanId" in ($1,$2)))', [A, B]);
    await admin.query('delete from devis_options where "devisId" in (select id from devis where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from devis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "Client B"])).rows[0].id;
    devisA = (await admin.query('insert into devis ("artisanId","clientId",numero) values ($1,$2,$3) returning id', [A, clientA, "DO-A1"])).rows[0].id;
    devisB = (await admin.query('insert into devis ("artisanId","clientId",numero) values ($1,$2,$3) returning id', [B, clientB, "DO-B1"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + listByDevis scopés au devis possédé (tri par ordre)", async () => {
    await repo.create(ctx(A), { devisId: devisA, nom: "Premium", ordre: 2 });
    const eco = await repo.create(ctx(A), { devisId: devisA, nom: "Éco", ordre: 1, recommandee: true });
    expect(eco?.recommandee).toBe(true);
    const list = await repo.listByDevis(ctx(A), devisA);
    expect(list?.map((o) => o.nom)).toEqual(["Éco", "Premium"]);
  });

  it("anti-IDOR : un autre tenant ne voit ni ne crée d'option sur le devis de A (sentinel null)", async () => {
    expect(await repo.listByDevis(ctx(B), devisA)).toBeNull();
    expect(await repo.create(ctx(B), { devisId: devisA, nom: "Hack" })).toBeNull();
    // Symétrique : A ne voit pas non plus le devis de B.
    expect(await repo.listByDevis(ctx(A), devisB)).toBeNull();
  });

  it("select : marque l'option et désélectionne les autres du même devis", async () => {
    const o1 = await repo.create(ctx(A), { devisId: devisA, nom: "S1" });
    const o2 = await repo.create(ctx(A), { devisId: devisA, nom: "S2" });
    await repo.select(ctx(A), o1!.id);
    const sel = await repo.select(ctx(A), o2!.id);
    expect(sel?.selectionnee).toBe(true);
    const list = await repo.listByDevis(ctx(A), devisA);
    expect(list?.find((o) => o.id === o1!.id)?.selectionnee).toBe(false);
    expect(list?.find((o) => o.id === o2!.id)?.selectionnee).toBe(true);
  });

  it("anti-IDOR : B ne peut ni sélectionner, ni supprimer, ni convertir une option de A", async () => {
    const opt = await repo.create(ctx(A), { devisId: devisA, nom: "Protégée" });
    expect(await repo.select(ctx(B), opt!.id)).toBeNull();
    expect(await repo.remove(ctx(B), opt!.id)).toBe(false);
    expect(await repo.convertirEnDevis(ctx(B), opt!.id)).toBe(false);
    // L'option de A est intacte.
    expect((await repo.listByDevis(ctx(A), devisA))?.some((o) => o.id === opt!.id)).toBe(true);
  });

  it("remove : supprime l'option et ses lignes (cascade)", async () => {
    const opt = await repo.create(ctx(A), { devisId: devisA, nom: "Jetable" });
    await admin.query('insert into devis_options_lignes ("optionId",designation,"prixUnitaireHT") values ($1,$2,$3)', [opt!.id, "L1", "10.00"]);
    expect(await repo.remove(ctx(A), opt!.id)).toBe(true);
    const lignes = await admin.query('select id from devis_options_lignes where "optionId"=$1', [opt!.id]);
    expect(lignes.rowCount).toBe(0);
    expect((await repo.listByDevis(ctx(A), devisA))?.some((o) => o.id === opt!.id)).toBe(false);
  });

  it("convertirEnDevis : copie les lignes de l'option dans le devis + reporte les totaux + sélectionne", async () => {
    const opt = await repo.create(ctx(A), { devisId: devisA, nom: "Convertie" });
    // Totaux stockés de l'option (calculés en amont par le legacy) + 1 ligne d'option.
    await admin.query('update devis_options set "totalHT"=$2,"totalTVA"=$3,"totalTTC"=$4 where id=$1', [opt!.id, "100.00", "20.00", "120.00"]);
    await admin.query(
      'insert into devis_options_lignes ("optionId",designation,quantite,"prixUnitaireHT","tauxTVA","montantHT","montantTVA","montantTTC") values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [opt!.id, "Prestation", "1.00", "100.00", "20.00", "100.00", "20.00", "120.00"],
    );
    // Une ligne pré-existante sur le devis doit être remplacée.
    await admin.query('insert into devis_lignes ("devisId",designation,"prixUnitaireHT") values ($1,$2,$3)', [devisA, "Ancienne", "5.00"]);
    expect(await repo.convertirEnDevis(ctx(A), opt!.id)).toBe(true);
    const lignes = await admin.query('select designation, "montantTTC" from devis_lignes where "devisId"=$1', [devisA]);
    expect(lignes.rows.map((r) => r.designation)).toEqual(["Prestation"]);
    const d = await admin.query('select "totalHT","totalTVA","totalTTC" from devis where id=$1', [devisA]);
    expect(d.rows[0]).toMatchObject({ totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00" });
    const optRow = await admin.query('select selectionnee from devis_options where id=$1', [opt!.id]);
    expect(optRow.rows[0].selectionnee).toBe(true);
  });
});
