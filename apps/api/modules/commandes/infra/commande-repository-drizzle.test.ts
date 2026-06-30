import { describe, it, expect, afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { CommandeRepositoryDrizzle } from "./commande-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9970011;
const B = 9970012;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("CommandeRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new CommandeRepositoryDrizzle(app.db);
  let fournA = 0;
  let fournB = 0;

  const cleanup = async () => {
    await admin.query(
      'delete from lignes_commandes_fournisseurs where "commandeId" in (select id from commandes_fournisseurs where "artisanId" in ($1,$2))',
      [A, B],
    );
    await admin.query('delete from commandes_fournisseurs where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from fournisseurs where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(async () => {
    await cleanup();
    fournA = (await admin.query('insert into fournisseurs ("artisanId", nom) values ($1,$2) returning id', [A, "Point P"])).rows[0].id;
    fournB = (await admin.query('insert into fournisseurs ("artisanId", nom) values ($1,$2) returning id', [B, "Cedeo"])).rows[0].id;
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create : fournisseur owned, totaux calculés serveur (Σ lignes = totalHT)", async () => {
    const cmd = await repo.create(ctx(A), {
      fournisseurId: fournA,
      lignes: [
        { designation: "Tube", quantite: "10", prixUnitaire: "5.00", tauxTVA: "20" }, // HT 50
        { designation: "Coude", quantite: "4", prixUnitaire: "2.50", tauxTVA: "10" }, // HT 10
      ],
    });
    expect(cmd).not.toBeNull();
    expect(cmd!.artisanId).toBe(A);
    expect(cmd!.statut).toBe("brouillon");
    expect(cmd!.numero).toMatch(/^CMD-\d{5}$/);
    // totalHT = 50 + 10 = 60 ; TVA = 50*0.2 + 10*0.1 = 11 ; TTC = 71
    expect(cmd!.totalHT).toBe("60.00");
    expect(cmd!.totalTVA).toBe("11.00");
    expect(cmd!.totalTTC).toBe("71.00");
    // invariant : Σ montantTotal des lignes = totalHT
    const lignes = await repo.listLignes(ctx(A), cmd!.id);
    const sommeLignes = lignes.reduce((s, l) => s + Number(l.montantTotal), 0);
    expect(sommeLignes.toFixed(2)).toBe(cmd!.totalHT);
    expect(lignes.map((l) => l.quantiteRecue)).toEqual(["0.00", "0.00"]);
  });

  it("create : fournisseur d'un autre tenant → null (anti-IDOR-FK)", async () => {
    expect(await repo.create(ctx(A), { fournisseurId: fournB, lignes: [] })).toBeNull();
  });

  it("list/getById/listLignes scopés + isolation cross-tenant", async () => {
    const cmd = await repo.create(ctx(A), { fournisseurId: fournA, lignes: [{ designation: "X", quantite: "1", prixUnitaire: "1" }] });
    expect((await repo.list(ctx(A))).some((c) => c.id === cmd!.id)).toBe(true);
    expect((await repo.list(ctx(B))).some((c) => c.id === cmd!.id)).toBe(false);
    await expectCrossTenantDenied(() => repo.getById(ctx(B), cmd!.id));
    // B ne lit pas les lignes de la commande de A
    expect(await repo.listLignes(ctx(B), cmd!.id)).toEqual([]);
    // B ne modifie/supprime pas
    expect(await repo.update(ctx(B), cmd!.id, { notes: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), cmd!.id)).toBe(false);
  });

  it("delete : purge la commande + ses lignes (cascade), scopé", async () => {
    const cmd = await repo.create(ctx(A), { fournisseurId: fournA, lignes: [{ designation: "Y", quantite: "2", prixUnitaire: "3" }] });
    expect(await repo.delete(ctx(A), cmd!.id)).toBe(true);
    expect(await repo.getById(ctx(A), cmd!.id)).toBeNull();
    const n = await admin.query('select count(*)::int as n from lignes_commandes_fournisseurs where "commandeId"=$1', [cmd!.id]);
    expect(n.rows[0].n).toBe(0);
  });

  it("TVA arrondie correctement (round2 IEEE-754) : 5.5% sur 100€ HT → 5.50 exactement", async () => {
    const cmd = await repo.create(ctx(A), {
      fournisseurId: fournA,
      lignes: [
        { designation: "Article", quantite: "100", prixUnitaire: "1.00", tauxTVA: "5.5" }, /* HT 100, TVA = 5.50 */
      ],
    });
    expect(cmd).not.toBeNull();
    expect(cmd!.totalHT).toBe("100.00");
    expect(cmd!.totalTVA).toBe("5.50");
    expect(cmd!.totalTTC).toBe("105.50");
    /* Invariant : Σ(lignesTV A arrondies) === totalTVA (pas d'accumulation flottante) */
    const lignes = await repo.listLignes(ctx(A), cmd!.id);
    const sommeTVA = lignes.reduce((s, l) => s + (Number(l.montantTotal) * (Number(l.tauxTVA) / 100)), 0);
    /* La somme des TVA par ligne arrondies doit égaler totalTVA au 2e décimal */
    expect(Math.abs(sommeTVA - Number(cmd!.totalTVA))).toBeLessThan(0.001);
  });

  describe("recevoir() — garde non-négative + atomicité stock (OPE-833/835)", () => {
    const cleanupStock = async () => {
      await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId"=$1)', [A]);
      await admin.query('delete from stocks where "artisanId"=$1', [A]);
    };
    beforeEach(cleanupStock);
    afterEach(cleanupStock);

    it("correction corrective rendant le stock négatif → throw, stock inchangé (OPE-833)", async () => {
      const stockId: number = (await admin.query(
        'insert into stocks ("artisanId", reference, designation, "quantiteEnStock") values ($1,$2,$3,$4) returning id',
        [A, "S-NEG", "Tube test", "4.00"],
      )).rows[0].id;

      const cmd = await repo.create(ctx(A), { fournisseurId: fournA, lignes: [{ designation: "Tube test", quantite: "10", prixUnitaire: "5" }] });
      const lignes = await repo.listLignes(ctx(A), cmd!.id);
      await admin.query('update lignes_commandes_fournisseurs set "stockId"=$1 where id=$2', [stockId, lignes[0].id]);

      /** Réception initiale : +8 → stock 4+8=12 */
      await repo.recevoir(ctx(A), cmd!.id, [{ ligneId: lignes[0].id, quantiteRecue: 8 }]);

      /** Consommation externe — ramène le stock à 1 */
      await admin.query('update stocks set "quantiteEnStock"=$1 where id=$2', ["1.00", stockId]);

      /** Correction à 0 reçu : delta = 0-8 = -8, apres = 1-8 = -7 → doit rejeter */
      await expect(
        repo.recevoir(ctx(A), cmd!.id, [{ ligneId: lignes[0].id, quantiteRecue: 0 }]),
      ).rejects.toThrow();

      /** Stock reste à 1 (transaction rollbackée) */
      const row = (await admin.query('select "quantiteEnStock" from stocks where id=$1', [stockId])).rows[0];
      expect(parseFloat(row.quantiteEnStock)).toBeCloseTo(1, 2);
    });

    it("correction valide dans les limites du stock → stock mis à jour (OPE-833/835)", async () => {
      const stockId: number = (await admin.query(
        'insert into stocks ("artisanId", reference, designation, "quantiteEnStock") values ($1,$2,$3,$4) returning id',
        [A, "S-OK", "Coude test", "10.00"],
      )).rows[0].id;

      const cmd = await repo.create(ctx(A), { fournisseurId: fournA, lignes: [{ designation: "Coude test", quantite: "10", prixUnitaire: "2" }] });
      const lignes = await repo.listLignes(ctx(A), cmd!.id);
      await admin.query('update lignes_commandes_fournisseurs set "stockId"=$1 where id=$2', [stockId, lignes[0].id]);

      /** Réception initiale +8 → stock 10+8=18 */
      await repo.recevoir(ctx(A), cmd!.id, [{ ligneId: lignes[0].id, quantiteRecue: 8 }]);

      /** Correction à 6 : delta = 6-8 = -2, apres = 18-2 = 16 → OK */
      await repo.recevoir(ctx(A), cmd!.id, [{ ligneId: lignes[0].id, quantiteRecue: 6 }]);

      const row = (await admin.query('select "quantiteEnStock" from stocks where id=$1', [stockId])).rows[0];
      expect(parseFloat(row.quantiteEnStock)).toBeCloseTo(16, 2);
    });
  });
});
