import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { StockRepositoryDrizzle } from "../../infra/stock-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const US = 9939006;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("stocks.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanS = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [US]);
    await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId" in (select id from artisans where "userId"=$1))', [US]);
    await admin.query('delete from stocks where "artisanId" in (select id from artisans where "userId"=$1)', [US]);
    await admin.query('delete from artisans where "userId"=$1', [US]);
    await admin.query("delete from users where id=$1", [US]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [US, `u${US}@t.fr`]);
    artisanS = (await admin.query('insert into artisans ("userId") values ($1) returning id', [US])).rows[0].id;
    const repo = new StockRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), stockRepo: repo, stocksDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanS]);
    await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId"=$1)', [artisanS]);
    await admin.query('delete from stocks where "artisanId"=$1', [artisanS]);
    await admin.query('delete from artisans where "userId"=$1', [US]);
    await admin.query("delete from users where id=$1", [US]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → stock ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tS = await token(US);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "stocks.create", { reference: "REF-001", designation: "Vis M6" }, tS);
    expect(res.statusCode).toBe(200);
    const stockId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='stock.cree'", [stockId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanS);
    expect(row.userId).toBe(US);
    expect(row.entityType).toBe("stock");
    expect((row.payload as { reference?: string }).reference).toBe("REF-001");
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après write stock → 0 stock ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanS, userId: US, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new StockRepositoryDrizzle(app.db);
    const cntBefore = Number((await admin.query('select count(*) from stocks where "artisanId"=$1', [artisanS])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { reference: "ROLLBACK", designation: "Test rollback" });
        if (tx) await outboxEvent(tx, ctx, { action: "stock.cree", entityType: "stock", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const cntAfter = Number((await admin.query('select count(*) from stocks where "artisanId"=$1', [artisanS])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(cntAfter).toBe(cntBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});
