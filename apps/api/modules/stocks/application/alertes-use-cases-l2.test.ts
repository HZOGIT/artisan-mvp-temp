import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { StockRepositoryDrizzle } from "../infra/stock-repository-drizzle";
import { NotificationRepositoryDrizzle } from "../../notifications/infra/notification-repository-drizzle";
import { genererAlertesStock } from "./alertes-use-cases";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9960041;
const B = 9960042;
const ctx: TenantContext = { artisanId: A, userId: 1 };
const ctxB: TenantContext = { artisanId: B, userId: 2 };

describe.skipIf(!URL)("genererAlertesStock L2 — déduplication + réarmement (PG)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const stockRepo = new StockRepositoryDrizzle(app.db);
  const notifRepo = new NotificationRepositoryDrizzle(app.db);

  const cleanupNotifs = () => admin.query('delete from notifications where "artisanId" = $1', [A]);
  const cleanupStocks = async () => {
    await admin.query(
      'delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId" = $1)',
      [A],
    );
    await admin.query('delete from stocks where "artisanId" = $1', [A]);
  };

  beforeAll(async () => {
    await cleanupNotifs();
    await cleanupStocks();
  });

  afterAll(async () => {
    await cleanupNotifs();
    await cleanupStocks();
    await app.close();
    await admin.end();
  });

  it("stock sous seuil N fois → 1 seule alerte active (déduplication)", async () => {
    await cleanupNotifs();
    await cleanupStocks();

    const s = await stockRepo.create(ctx, {
      reference: "L2-REF-DEDUP",
      designation: "Article test dédup",
      quantiteEnStock: "2",
      seuilAlerte: "5",
    });
    expect(s.id).toBeGreaterThan(0);

    // 3 passages cron successifs → 1 seule alerte, pas de flood
    const r1 = await genererAlertesStock(stockRepo, notifRepo, ctx);
    const r2 = await genererAlertesStock(stockRepo, notifRepo, ctx);
    const r3 = await genererAlertesStock(stockRepo, notifRepo, ctx);

    expect(r1.alertsCreated).toBe(1);
    expect(r2.alertsCreated).toBe(0);
    expect(r3.alertsCreated).toBe(0);

    const { rows } = await admin.query(
      'select count(*)::int as n from notifications where "artisanId" = $1 and archived = false',
      [A],
    );
    expect(rows[0].n).toBe(1);
  });

  it("réarmement : alerte archivée quand le stock remonte, nouvelle émise à la prochaine descente", async () => {
    await cleanupNotifs();
    await cleanupStocks();

    const s = await stockRepo.create(ctx, {
      reference: "L2-REF-REARM",
      designation: "Article test réarmement",
      quantiteEnStock: "2",
      seuilAlerte: "5",
    });

    // 1ʳᵉ descente → alerte créée
    expect((await genererAlertesStock(stockRepo, notifRepo, ctx)).alertsCreated).toBe(1);

    // stock remonte au-dessus du seuil
    await stockRepo.adjustQuantity(ctx, s.id, { type: "entree", quantite: "20" });

    // cron suivant : alerte archivée (réarmement), 0 nouvelles
    expect((await genererAlertesStock(stockRepo, notifRepo, ctx)).alertsCreated).toBe(0);
    const { rows: archived } = await admin.query(
      'select count(*)::int as n from notifications where "artisanId" = $1 and archived = true',
      [A],
    );
    expect(archived[0].n).toBeGreaterThan(0);

    // stock redescend (22 - 18 = 4 ≤ seuil 5)
    await stockRepo.adjustQuantity(ctx, s.id, { type: "sortie", quantite: "18" });

    // cron suivant : nouvelle alerte créée
    expect((await genererAlertesStock(stockRepo, notifRepo, ctx)).alertsCreated).toBe(1);

    const { rows: active } = await admin.query(
      'select count(*)::int as n from notifications where "artisanId" = $1 and archived = false',
      [A],
    );
    expect(active[0].n).toBe(1);
  });
});

describe.skipIf(!URL)("genererAlertesStock L2 — event outbox stock.seuil_bas_atteint (PG)", () => {
  const admin2 = new Pool({ connectionString: URL });
  const app2 = createDbClient(APP_URL!);
  const stockRepo2 = new StockRepositoryDrizzle(app2.db);
  const notifRepo2 = new NotificationRepositoryDrizzle(app2.db);

  const cleanup = async () => {
    await admin2.query('delete from event_outbox where "artisanId" = $1', [B]);
    await admin2.query('delete from notifications where "artisanId" = $1', [B]);
    await admin2.query(
      'delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId" = $1)',
      [B],
    );
    await admin2.query('delete from stocks where "artisanId" = $1', [B]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app2.close();
    await admin2.end();
  });

  it("franchissement du seuil → event stock.seuil_bas_atteint émis une seule fois (pas de flood)", async () => {
    await cleanup();
    const s = await stockRepo2.create(ctxB, {
      reference: "L2-EVT-SEUIL",
      designation: "Article test event seuil",
      quantiteEnStock: "3",
      seuilAlerte: "10",
    });

    const before = Number((await admin2.query('select count(*) from event_outbox where "artisanId" = $1 and action = $2', [B, "stock.seuil_bas_atteint"])).rows[0].count);

    const r1 = await genererAlertesStock(stockRepo2, notifRepo2, ctxB, app2.db);
    expect(r1.alertsCreated).toBe(1);

    const after1 = Number((await admin2.query('select count(*) from event_outbox where "artisanId" = $1 and action = $2', [B, "stock.seuil_bas_atteint"])).rows[0].count);
    expect(after1).toBe(before + 1);

    const row = (await admin2.query('select * from event_outbox where "artisanId" = $1 and action = $2 and "entityId" = $3', [B, "stock.seuil_bas_atteint", s.id])).rows[0];
    expect(row).toBeDefined();
    expect((row.payload as { stockId: number }).stockId).toBe(s.id);

    const r2 = await genererAlertesStock(stockRepo2, notifRepo2, ctxB, app2.db);
    expect(r2.alertsCreated).toBe(0);

    const after2 = Number((await admin2.query('select count(*) from event_outbox where "artisanId" = $1 and action = $2', [B, "stock.seuil_bas_atteint"])).rows[0].count);
    expect(after2).toBe(after1);
  });
});
