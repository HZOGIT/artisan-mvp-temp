import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import type { DbClient, DbHandle } from "../../../shared/db";
import { runStocksQuantiteReconciler } from "./stocks-reconciler";

const DB_URL = process.env.DATABASE_URL;
const APP_DB_URL = process.env.APP_DATABASE_URL;

const ARTISAN_ID = 9877001;

describe.skipIf(!DB_URL)("stocks-reconciler — L2", () => {
  let handle: DbHandle;
  let db: DbClient;
  let admin: Pool;

  const cleanAll = () =>
    Promise.all([
      admin.query(`DELETE FROM mouvements_stock WHERE "stockId" IN (SELECT id FROM stocks WHERE "artisanId" = $1)`, [ARTISAN_ID]),
      admin.query(`DELETE FROM stocks WHERE "artisanId" = $1`, [ARTISAN_ID]),
      admin.query(`DELETE FROM event_outbox WHERE "artisanId" = $1`, [ARTISAN_ID]),
    ]);

  beforeAll(async () => {
    admin = new Pool({ connectionString: DB_URL });
    handle = createDbClient(DB_URL!);
    db = handle.db;
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
    await handle.close();
    await admin.end();
  });

  beforeEach(() => cleanAll());
  afterEach(() => cleanAll());

  it("stock divergent (delta ≤ seuil ambigu) → réparé + healing event atomique", async () => {
    const { rows: [stock] } = await admin.query<{ id: number }>(
      `INSERT INTO stocks ("artisanId", reference, designation, "quantiteEnStock", "updatedAt")
       VALUES ($1, 'REF-L2-01', 'Stock Test', '15.00', NOW() - INTERVAL '10 minutes')
       RETURNING id`,
      [ARTISAN_ID],
    );
    const stockId = stock!.id;
    await admin.query(
      `INSERT INTO mouvements_stock ("stockId", type, quantite, "quantiteAvant", "quantiteApres", motif, "createdAt")
       VALUES ($1, 'entree', '10.00', '0.00', '10.00', 'Stock initial', NOW() - INTERVAL '15 minutes')`,
      [stockId],
    );
    /* delta = |15 - 10| = 5 ≤ seuilAmbiguQuantite(10) → cas reparable */

    await runStocksQuantiteReconciler(db, { dryRun: false, seuilAmbiguQuantite: 10 });

    const { rows: [updated] } = await admin.query<{ quantiteEnStock: string }>(
      `SELECT "quantiteEnStock" FROM stocks WHERE id = $1`,
      [stockId],
    );
    expect(updated!.quantiteEnStock).toBe("10.00");

    const { rows: events } = await admin.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.stock.quantite-divergente'`,
      [ARTISAN_ID],
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ dryRun: false, avant: "15.00", apres: "10.00" });
  });

  it("dry-run → stocks non modifié, healing event dryRun:true émis", async () => {
    const { rows: [stock] } = await admin.query<{ id: number }>(
      `INSERT INTO stocks ("artisanId", reference, designation, "quantiteEnStock", "updatedAt")
       VALUES ($1, 'REF-L2-02', 'Stock Dry', '15.00', NOW() - INTERVAL '10 minutes')
       RETURNING id`,
      [ARTISAN_ID],
    );
    const stockId = stock!.id;
    await admin.query(
      `INSERT INTO mouvements_stock ("stockId", type, quantite, "quantiteAvant", "quantiteApres", motif, "createdAt")
       VALUES ($1, 'entree', '10.00', '0.00', '10.00', 'Stock dry', NOW() - INTERVAL '15 minutes')`,
      [stockId],
    );

    await runStocksQuantiteReconciler(db, { dryRun: true, seuilAmbiguQuantite: 10 });

    const { rows: [notUpdated] } = await admin.query<{ quantiteEnStock: string }>(
      `SELECT "quantiteEnStock" FROM stocks WHERE id = $1`,
      [stockId],
    );
    expect(notUpdated!.quantiteEnStock).toBe("15.00");

    const { rows: events } = await admin.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.stock.quantite-divergente'`,
      [ARTISAN_ID],
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ dryRun: true });
  });

  it("delta ambigu (delta > seuil) → revue-requise event, stocks non modifié, pas d'auto-fix", async () => {
    const { rows: [stock] } = await admin.query<{ id: number }>(
      `INSERT INTO stocks ("artisanId", reference, designation, "quantiteEnStock", "updatedAt")
       VALUES ($1, 'REF-L2-03', 'Stock Ambigu', '100.00', NOW() - INTERVAL '10 minutes')
       RETURNING id`,
      [ARTISAN_ID],
    );
    const stockId = stock!.id;
    await admin.query(
      `INSERT INTO mouvements_stock ("stockId", type, quantite, "quantiteAvant", "quantiteApres", motif, "createdAt")
       VALUES ($1, 'entree', '5.00', '0.00', '5.00', 'Stock ambigu', NOW() - INTERVAL '15 minutes')`,
      [stockId],
    );
    /* delta = |100 - 5| = 95 > seuilAmbiguQuantite(10) → ambigu */

    await runStocksQuantiteReconciler(db, { dryRun: false, seuilAmbiguQuantite: 10 });

    const { rows: [notUpdated] } = await admin.query<{ quantiteEnStock: string }>(
      `SELECT "quantiteEnStock" FROM stocks WHERE id = $1`,
      [stockId],
    );
    expect(notUpdated!.quantiteEnStock).toBe("100.00");

    const { rows: revue } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.stock.revue-requise'`,
      [ARTISAN_ID],
    );
    expect(revue).toHaveLength(1);

    const { rows: autoFix } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.stock.quantite-divergente'`,
      [ARTISAN_ID],
    );
    expect(autoFix).toHaveLength(0);
  });

  /**
   * rls-guard : démontre que app_tenant sans contexte tenant retourne 0 stocks (FORCE RLS) →
   * detect() aveugle → faux-négatif → ownerDb OBLIGATOIRE pour le reconciler.
   * Ce test DOIT échouer si on remplace ownerDb par app_tenant dans runStocksQuantiteReconciler.
   */
  it("rls-guard : app_tenant sans contexte → detect voit 0 stocks, anomalie non corrigée", async () => {
    if (!APP_DB_URL) return;

    const { rows: [stock] } = await admin.query<{ id: number }>(
      `INSERT INTO stocks ("artisanId", reference, designation, "quantiteEnStock", "updatedAt")
       VALUES ($1, 'REF-L2-RLS', 'Stock RLS Guard', '15.00', NOW() - INTERVAL '10 minutes')
       RETURNING id`,
      [ARTISAN_ID],
    );
    const stockId = stock!.id;
    await admin.query(
      `INSERT INTO mouvements_stock ("stockId", type, quantite, "quantiteAvant", "quantiteApres", motif, "createdAt")
       VALUES ($1, 'entree', '10.00', '0.00', '10.00', 'Stock rls', NOW() - INTERVAL '15 minutes')`,
      [stockId],
    );

    const appHandle = createDbClient(APP_DB_URL);
    try {
      /* app_tenant sans SET app.tenant → FORCE RLS → stocks retourne 0 lignes → detect() = [] */
      await runStocksQuantiteReconciler(appHandle.db, { dryRun: false });

      const { rows: [notFixed] } = await admin.query<{ quantiteEnStock: string }>(
        `SELECT "quantiteEnStock" FROM stocks WHERE id = $1`,
        [stockId],
      );
      /* anomalie NON corrigée : faux-négatif confirmé, ownerDb est obligatoire */
      expect(notFixed!.quantiteEnStock).toBe("15.00");

      const { rows: events } = await admin.query(
        `SELECT 1 FROM event_outbox WHERE "artisanId" = $1 AND action LIKE 'healing.stock.%'`,
        [ARTISAN_ID],
      );
      expect(events).toHaveLength(0);
    } finally {
      await appHandle.close();
    }
  });

  it("seuil dépassé → onSeuilDepasse appelé, rien réparé, 0 event", async () => {
    for (let i = 1; i <= 4; i++) {
      const { rows: [stock] } = await admin.query<{ id: number }>(
        `INSERT INTO stocks ("artisanId", reference, designation, "quantiteEnStock", "updatedAt")
         VALUES ($1, $2, $3, '15.00', NOW() - INTERVAL '10 minutes')
         RETURNING id`,
        [ARTISAN_ID, `REF-L2-S${i}`, `Stock Seuil ${i}`],
      );
      await admin.query(
        `INSERT INTO mouvements_stock ("stockId", type, quantite, "quantiteAvant", "quantiteApres", motif, "createdAt")
         VALUES ($1, 'entree', '10.00', '0.00', '10.00', 'Seuil test', NOW() - INTERVAL '15 minutes')`,
        [stock!.id],
      );
    }

    let seuilAnomalies: ReadonlyArray<unknown> | null = null;
    await runStocksQuantiteReconciler(db, {
      dryRun: false,
      seuil: 3,
      onSeuilDepasse: async (a) => { seuilAnomalies = a; },
    });

    expect(seuilAnomalies).not.toBeNull();
    expect((seuilAnomalies as unknown[]).length).toBeGreaterThanOrEqual(4);

    const { rows } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE "artisanId" = $1 AND action LIKE 'healing.stock.%'`,
      [ARTISAN_ID],
    );
    expect(rows).toHaveLength(0);
  });

  it("idempotent — 2ème run post-réparation ne détecte plus d'anomalie", async () => {
    const { rows: [stock] } = await admin.query<{ id: number }>(
      `INSERT INTO stocks ("artisanId", reference, designation, "quantiteEnStock", "updatedAt")
       VALUES ($1, 'REF-L2-IDEM', 'Stock Idempotent', '15.00', NOW() - INTERVAL '10 minutes')
       RETURNING id`,
      [ARTISAN_ID],
    );
    const stockId = stock!.id;
    await admin.query(
      `INSERT INTO mouvements_stock ("stockId", type, quantite, "quantiteAvant", "quantiteApres", motif, "createdAt")
       VALUES ($1, 'entree', '10.00', '0.00', '10.00', 'Idempotent test', NOW() - INTERVAL '15 minutes')`,
      [stockId],
    );

    await runStocksQuantiteReconciler(db, { dryRun: false });
    await admin.query(`DELETE FROM event_outbox WHERE "artisanId" = $1`, [ARTISAN_ID]);
    /* Remet updatedAt dans le passé pour repasser le filtre de stabilité. */
    await admin.query(
      `UPDATE stocks SET "updatedAt" = NOW() - INTERVAL '10 minutes' WHERE id = $1`,
      [stockId],
    );
    await runStocksQuantiteReconciler(db, { dryRun: false });

    const { rows } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE "artisanId" = $1 AND action LIKE 'healing.stock.%'`,
      [ARTISAN_ID],
    );
    expect(rows).toHaveLength(0);
  });
});
