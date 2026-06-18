import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { FactureRepositoryDrizzle } from "./facture-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// ⚠️ Plage d'ids UNIQUE à ce fichier (évite la collision cross-fichiers en run parallèle :
// le 994001 était partagé avec notes_de_frais → cleanup croisé des `clients` seedés).
const A = 9940011;
const B = 9940012;
const UA = 9940013;
const UB = 9940014;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("FactureRepositoryDrizzle (PG, RLS + scope tenant + lignes)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new FactureRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;
  let devisA = 0;

  const cleanup = async () => {
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from factures where "artisanId" in ($1,$2)', [A, B]);
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
    devisA = (await admin.query('insert into devis ("artisanId","clientId",numero) values ($1,$2,$3) returning id', [A, clientA, "DEV-FACT-A"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("nextNumero : FAC-00001 puis incrément (préfixe + compteur parametres_artisan, parité legacy)", async () => {
    expect(await repo.nextNumero(ctx(A))).toBe("FAC-00001");
    const f = await repo.create(ctx(A), { clientId: clientA, numero: "FAC-00001" });
    expect(f.numero).toBe("FAC-00001");
    expect(await repo.nextNumero(ctx(A))).toBe("FAC-00002");
  });

  it("create + getById + list scopés ; défauts (brouillon, totaux/montantPaye 0, typeDocument facture)", async () => {
    const f = await repo.create(ctx(A), { clientId: clientA, devisId: devisA, numero: "FAC-A1", objet: "Travaux" });
    expect(f.artisanId).toBe(A);
    expect(f.statut).toBe("brouillon");
    expect(f.typeDocument).toBe("facture");
    expect(f.totalTTC).toBe("0.00");
    expect(f.montantPaye).toBe("0.00");
    expect(f.devisId).toBe(devisA);
    expect((await repo.getById(ctx(A), f.id))?.objet).toBe("Travaux");
    expect((await repo.list(ctx(A))).some((x) => x.id === f.id)).toBe(true);
  });

  it("ownsClient / ownsDevis : tenant → true ; autre tenant → false (anti-IDOR-FK)", async () => {
    expect(await repo.ownsClient(ctx(A), clientA)).toBe(true);
    expect(await repo.ownsClient(ctx(A), clientB)).toBe(false);
    expect(await repo.ownsDevis(ctx(A), devisA)).toBe(true);
    expect(await repo.ownsDevis(ctx(B), devisA)).toBe(false);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas la facture de A", async () => {
    const f = await repo.create(ctx(A), { clientId: clientA, numero: "FAC-SEC", objet: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), f.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === f.id)).toBe(false);
    expect(await repo.update(ctx(B), f.id, { objet: "hack" })).toBeNull();
    expect(await repo.setStatut(ctx(B), f.id, "validee")).toBeNull();
    expect(await repo.delete(ctx(B), f.id)).toBe(false);
    expect((await repo.getById(ctx(A), f.id))?.objet).toBe("Secret");
  });

  it("setStatut + update métadonnées (numero/clientId non touchés)", async () => {
    const f = await repo.create(ctx(A), { clientId: clientA, numero: "FAC-ST", objet: "Avant" });
    expect((await repo.setStatut(ctx(A), f.id, "validee"))?.statut).toBe("validee");
    const maj = await repo.update(ctx(A), f.id, { objet: "Après" });
    expect(maj?.objet).toBe("Après");
    expect(maj?.numero).toBe("FAC-ST");
    expect(maj?.clientId).toBe(clientA);
  });

  it("lignes : addLigne recalcule les totaux ; section neutre ; scope via parent ; cascade delete", async () => {
    const f = await repo.create(ctx(A), { clientId: clientA, numero: "FAC-LIG" });
    const l1 = await repo.addLigne(ctx(A), f.id, { designation: "Main d'œuvre", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" });
    expect(l1?.montantTTC).toBe("240.00");
    await repo.addLigne(ctx(A), f.id, { designation: "— Lot 1 —", type: "section", quantite: "9", prixUnitaireHT: "999" });
    let fv = await repo.getById(ctx(A), f.id);
    expect(fv?.totalHT).toBe("200.00");
    expect(fv?.totalTTC).toBe("240.00");
    expect(await repo.listLignes(ctx(B), f.id)).toEqual([]); // scope via parent
    expect((await repo.listLignes(ctx(A), f.id)).length).toBe(2);
    await repo.updateLigne(ctx(A), l1!.id, { quantite: "3" });
    fv = await repo.getById(ctx(A), f.id);
    expect(fv?.totalTTC).toBe("360.00");
    expect(await repo.updateLigne(ctx(B), l1!.id, { quantite: "99" })).toBeNull();
    expect(await repo.deleteLigne(ctx(B), l1!.id)).toBe(false);
    expect(await repo.deleteLigne(ctx(A), l1!.id)).toBe(true);
    fv = await repo.getById(ctx(A), f.id);
    expect(fv?.totalTTC).toBe("0.00");
    expect(await repo.delete(ctx(A), f.id)).toBe(true);
    expect(await repo.listLignes(ctx(A), f.id)).toEqual([]);
  });
});
