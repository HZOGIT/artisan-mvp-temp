import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DevisRepositoryDrizzle } from "./devis-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9930021;
const B = 9930022;
const UA = 9930023;
const UB = 9930024;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("DevisRepositoryDrizzle (PG, RLS + scope tenant + lignes)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new DevisRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;

  const cleanup = async () => {
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from devis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from parametres_artisan where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "Client B"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("nextNumero : DEV-00001 puis incrément (préfixe + compteur parametres_artisan, parité legacy)", async () => {
    expect(await repo.nextNumero(ctx(A))).toBe("DEV-00001");
    const d = await repo.create(ctx(A), { clientId: clientA, numero: "DEV-00001" });
    expect(d.numero).toBe("DEV-00001");
    expect(await repo.nextNumero(ctx(A))).toBe("DEV-00002"); // compteur réavancé + max DB
  });

  it("create + getById + list scopés au tenant ; défauts (brouillon, totaux 0)", async () => {
    const d = await repo.create(ctx(A), { clientId: clientA, numero: "DEV-A1", objet: "Réno" });
    expect(d.artisanId).toBe(A);
    expect(d.statut).toBe("brouillon");
    expect(d.totalTTC).toBe("0.00");
    expect((await repo.getById(ctx(A), d.id))?.objet).toBe("Réno");
    expect((await repo.list(ctx(A))).some((x) => x.id === d.id)).toBe(true);
  });

  it("ownsClient : client du tenant → true ; client d'un autre tenant → false (anti-IDOR-FK)", async () => {
    expect(await repo.ownsClient(ctx(A), clientA)).toBe(true);
    expect(await repo.ownsClient(ctx(A), clientB)).toBe(false);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le devis de A", async () => {
    const d = await repo.create(ctx(A), { clientId: clientA, numero: "DEV-SEC", objet: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), d.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === d.id)).toBe(false);
    expect(await repo.update(ctx(B), d.id, { objet: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), d.id)).toBe(false);
    expect((await repo.getById(ctx(A), d.id))?.objet).toBe("Secret");
  });

  it("update : métadonnées seulement (clientId/numero/statut/totaux non touchés)", async () => {
    const d = await repo.create(ctx(A), { clientId: clientA, numero: "DEV-UP", objet: "Avant" });
    const maj = await repo.update(ctx(A), d.id, { objet: "Après", notes: "n" });
    expect(maj?.objet).toBe("Après");
    expect(maj?.numero).toBe("DEV-UP"); // numéro inchangé
    expect(maj?.clientId).toBe(clientA); // client inchangé
    expect(maj?.statut).toBe("brouillon");
  });

  it("lignes : addLigne recalcule les totaux ; section neutre ; scope via parent ; cascade au delete", async () => {
    const d = await repo.create(ctx(A), { clientId: clientA, numero: "DEV-LIG" });
    const l1 = await repo.addLigne(ctx(A), d.id, { designation: "Pose", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" });
    expect(l1?.montantHT).toBe("200.00");
    expect(l1?.montantTTC).toBe("240.00");
    // section : montants neutralisés, totaux inchangés
    await repo.addLigne(ctx(A), d.id, { designation: "— Lot 1 —", type: "section", quantite: "9", prixUnitaireHT: "999" });
    let dv = await repo.getById(ctx(A), d.id);
    expect(dv?.totalHT).toBe("200.00");
    expect(dv?.totalTTC).toBe("240.00");
    // listLignes scopé via le parent : B ne voit rien
    expect(await repo.listLignes(ctx(B), d.id)).toEqual([]);
    expect((await repo.listLignes(ctx(A), d.id)).length).toBe(2);
    // updateLigne recalcule
    await repo.updateLigne(ctx(A), l1!.id, { quantite: "3" });
    dv = await repo.getById(ctx(A), d.id);
    expect(dv?.totalTTC).toBe("360.00");
    // B ne peut pas modifier/supprimer une ligne d'un devis de A
    expect(await repo.updateLigne(ctx(B), l1!.id, { quantite: "99" })).toBeNull();
    expect(await repo.deleteLigne(ctx(B), l1!.id)).toBe(false);
    // deleteLigne recalcule
    expect(await repo.deleteLigne(ctx(A), l1!.id)).toBe(true);
    dv = await repo.getById(ctx(A), d.id);
    expect(dv?.totalTTC).toBe("0.00");
    // delete devis → cascade lignes
    expect(await repo.delete(ctx(A), d.id)).toBe(true);
    expect(await repo.listLignes(ctx(A), d.id)).toEqual([]);
  });

  it("addLigne avec remise 20% : montantHT = pu × q × 0.8", async () => {
    const d = await repo.create(ctx(A), { clientId: clientA, numero: "DEV-REMISE-01" });
    const l = await repo.addLigne(ctx(A), d.id, {
      designation: "Fourniture remisée",
      quantite: "1",
      prixUnitaireHT: "50.00",
      tauxTVA: "20",
      remise: "20",
    });
    expect(l?.montantHT).toBe("40.00"); /* 50 × 0.8 */
    expect(l?.montantTTC).toBe("48.00"); /* 40 × 1.2 */
  });
});
