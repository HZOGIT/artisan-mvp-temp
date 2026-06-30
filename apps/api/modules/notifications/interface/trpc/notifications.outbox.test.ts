import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { NotificationRepositoryDrizzle } from "../../infra/notification-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9951001;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("notifications.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let notifId = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from notifications where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    notifId = (await admin.query('insert into notifications ("artisanId", titre, type) values ($1,$2,$3) returning id', [artisanA, "Test outbox", "info"])).rows[0].id;
    const repo = new NotificationRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), notificationRepo: repo, notificationsDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    await admin.query('delete from notifications where "artisanId"=$1', [artisanA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — markAsRead → notification.lue ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UA);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "notifications.markAsRead", { id: notifId }, tA);
    expect(res.statusCode).toBe(200);
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='notification.lue'", [notifId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UA);
    expect(row.entityType).toBe("notification");
    expect((row.payload as { notificationId?: number }).notificationId).toBe(notifId);
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — markAllAsRead → notification.lue PAR notif ET event_outbox co-écrits", async () => {
    const notifB1 = (await admin.query('insert into notifications ("artisanId", titre, type) values ($1,$2,$3) returning id', [artisanA, "Bulk 1", "info"])).rows[0].id as number;
    const notifB2 = (await admin.query('insert into notifications ("artisanId", titre, type) values ($1,$2,$3) returning id', [artisanA, "Bulk 2", "info"])).rows[0].id as number;
    const tA = await token(UA);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "notifications.markAllAsRead", {}, tA);
    expect(res.statusCode).toBe(200);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(outboxAfter).toBeGreaterThan(outboxBefore);
    const rows = (await admin.query("select * from event_outbox where \"artisanId\"=$1 and action='notification.lue' and \"entityId\" = any($2::int[])", [artisanA, [notifB1, notifB2]])).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.artisanId).toBe(artisanA);
      expect(row.entityType).toBe("notification");
    }
    await admin.query("delete from notifications where id = any($1::int[])", [[notifB1, notifB2]]);
  });

  it("outbox atomicité — rollback: throw après markAsRead → 0 changement ET 0 event_outbox persistés", async () => {
    const notifId2 = (await admin.query('insert into notifications ("artisanId", titre, type) values ($1,$2,$3) returning id', [artisanA, "Test rollback", "info"])).rows[0].id;
    const ctx = { artisanId: artisanA, userId: UA, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new NotificationRepositoryDrizzle(app.db);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.markAsRead(ctx, notifId2);
        if (tx) await outboxEvent(tx, ctx, { action: "notification.lue", entityType: "notification", entityId: notifId2, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const row = (await admin.query('select lu from notifications where id=$1', [notifId2])).rows[0];
    expect(outboxAfter).toBe(outboxBefore);
    expect(row.lu).toBe(false);
  });
});
