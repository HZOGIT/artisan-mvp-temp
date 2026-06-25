import { describe, it, expect, afterAll, beforeAll } from "vitest";
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
});
