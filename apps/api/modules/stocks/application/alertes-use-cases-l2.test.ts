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
const ctx: TenantContext = { artisanId: A, userId: 1 };

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
