import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { BudgetCategorieRepositoryDrizzle } from "../../infra/budget-categorie-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UB = 9939008;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("budgets-categories.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UB]);
    await admin.query("delete from budgets_categories where artisan_id in (select id from artisans where \"userId\"=$1)", [UB]);
    await admin.query('delete from artisans where "userId"=$1', [UB]);
    await admin.query("delete from users where id=$1", [UB]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    const repo = new BudgetCategorieRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), budgetCategorieRepo: repo, budgetsCategoriesDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanB]);
    await admin.query("delete from budgets_categories where artisan_id=$1", [artisanB]);
    await admin.query('delete from artisans where "userId"=$1', [UB]);
    await admin.query("delete from users where id=$1", [UB]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → budget ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tB = await token(UB);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "budgetsCategories.create", { categorie: "Matériaux", mois: "2026-01", budget: "500.00" }, tB);
    expect(res.statusCode).toBe(200);
    const budgetId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='budget_categorie.cree'", [budgetId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanB);
    expect(row.userId).toBe(UB);
    expect(row.entityType).toBe("budget_categorie");
    expect((row.payload as { montantPrevu?: string }).montantPrevu).toBe("500.00");
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après write budget → 0 budget ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanB, userId: UB, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new BudgetCategorieRepositoryDrizzle(app.db);
    const cntBefore = Number((await admin.query("select count(*) from budgets_categories where artisan_id=$1", [artisanB])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { categorie: "Rollback", mois: "2026-02", budget: "100.00" });
        if (tx) await outboxEvent(tx, ctx, { action: "budget_categorie.cree", entityType: "budget_categorie", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const cntAfter = Number((await admin.query("select count(*) from budgets_categories where artisan_id=$1", [artisanB])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(cntAfter).toBe(cntBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});
