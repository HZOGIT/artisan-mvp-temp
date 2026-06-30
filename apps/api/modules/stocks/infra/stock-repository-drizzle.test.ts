import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { StockRepositoryDrizzle } from "./stock-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 998001;
const B = 998002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("StockRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new StockRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from stocks where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await admin.query("delete from lignes_commandes_fournisseurs where \"commandeId\" in (select id from commandes_fournisseurs where \"artisanId\" in ($1,$2))", [A, B]);
    await admin.query("delete from commandes_fournisseurs where \"artisanId\" in ($1,$2)", [A, B]);
    await admin.query("delete from fournisseurs where \"artisanId\" in ($1,$2)", [A, B]);
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const s = await repo.create(ctx(A), { reference: "REF-1", designation: "Tube cuivre", quantiteEnStock: "100.00", seuilAlerte: "10.00" });
    expect(s.id).toBeGreaterThan(0);
    expect(s.artisanId).toBe(A);
    expect(s.quantiteEnStock).toBe("100.00");
    expect((await repo.getById(ctx(A), s.id))?.designation).toBe("Tube cuivre");
    expect((await repo.list(ctx(A))).some((x) => x.id === s.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le stock de A", async () => {
    const s = await repo.create(ctx(A), { reference: "SEC", designation: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), s.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === s.id)).toBe(false);
    expect(await repo.update(ctx(B), s.id, { designation: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), s.id)).toBe(false);
    expect((await repo.getById(ctx(A), s.id))?.designation).toBe("Secret");
  });

  it("update : modifie les métadonnées mais PAS la quantité (invariant audit)", async () => {
    const s = await repo.create(ctx(A), { reference: "Q", designation: "Avant", quantiteEnStock: "50.00" });
    const maj = await repo.update(ctx(A), s.id, { designation: "Après", emplacement: "Allée 3" });
    expect(maj?.designation).toBe("Après");
    expect(maj?.emplacement).toBe("Allée 3");
    expect(maj?.quantiteEnStock).toBe("50.00"); // quantité intacte
  });

  it("listEntrant : Σ(quantite-quantiteRecue) des commandes non soldées, isolé par tenant", async () => {
    const stock = await repo.create(ctx(A), { reference: "ENT-L2", designation: "Entrant L2", quantiteEnStock: "0.00" });
    const fId = (await admin.query("insert into fournisseurs (\"artisanId\", nom) values ($1, 'F-L2') returning id", [A])).rows[0].id as number;
    /* commande envoyée : (10-3) + (5-0) = 12 entrant */
    const cId = (await admin.query("insert into commandes_fournisseurs (\"artisanId\",\"fournisseurId\",statut) values ($1,$2,'envoyee') returning id", [A, fId])).rows[0].id as number;
    await admin.query(
      "insert into lignes_commandes_fournisseurs (\"commandeId\",\"stockId\",designation,quantite,\"quantiteRecue\") values ($1,$2,'L','10','3'),($1,$2,'L','5','0')",
      [cId, stock.id],
    );
    /* commande brouillon : exclue du calcul */
    const cBrouillon = (await admin.query("insert into commandes_fournisseurs (\"artisanId\",\"fournisseurId\",statut) values ($1,$2,'brouillon') returning id", [A, fId])).rows[0].id as number;
    await admin.query("insert into lignes_commandes_fournisseurs (\"commandeId\",\"stockId\",designation,quantite,\"quantiteRecue\") values ($1,$2,'L','99','0')", [cBrouillon, stock.id]);

    const entrantA = await repo.listEntrant(ctx(A));
    const ligne = entrantA.find((e) => e.stockId === stock.id);
    expect(ligne?.entrant).toBe(12); /* (10-3)+(5-0) ; brouillon exclu */

    /* isolation : tenant B ne voit rien */
    expect((await repo.listEntrant(ctx(B))).find((e) => e.stockId === stock.id)).toBeUndefined();
  });

  it("delete : purge le stock + ses mouvements (cascade), scopé", async () => {
    const s = await repo.create(ctx(A), { reference: "DEL", designation: "ASupprimer" });
    await admin.query(
      `insert into mouvements_stock ("stockId", type, quantite, "quantiteAvant", "quantiteApres") values ($1,'entree','5.00','0.00','5.00')`,
      [s.id],
    );
    expect(await repo.delete(ctx(A), s.id)).toBe(true);
    expect(await repo.getById(ctx(A), s.id)).toBeNull();
    const n = await admin.query('select count(*)::int as n from mouvements_stock where "stockId"=$1', [s.id]);
    expect(n.rows[0].n).toBe(0);
  });

  it("OPE-836 : CHECK quantiteEnStock >= 0 — insertion négative rejetée en DB", async () => {
    await expect(
      admin.query(
        `insert into stocks ("artisanId", reference, designation, "quantiteEnStock") values ($1,'NEG-1','Négatif','-1.00')`,
        [A],
      ),
    ).rejects.toThrow(/stocks_quantite_non_negative/);
  });

  it("OPE-837 : FK mouvements_stock.stockId — mouvement orphelin rejeté en DB", async () => {
    await expect(
      admin.query(
        `insert into mouvements_stock ("stockId", type, quantite, "quantiteAvant", "quantiteApres") values (999999999,'entree','1.00','0.00','1.00')`,
      ),
    ).rejects.toThrow(/mouvements_stock_stockid_fk/);
  });
});
