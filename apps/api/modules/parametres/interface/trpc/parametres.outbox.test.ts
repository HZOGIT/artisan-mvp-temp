import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ParametresRepositoryDrizzle } from "../../infra/parametres-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UP = 9969001;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("parametres.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from parametres_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [UP]);
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UP]);
    await admin.query('delete from artisans where "userId"=$1', [UP]);
    await admin.query("delete from users where id=$1", [UP]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UP, `u${UP}@t.fr`]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UP])).rows[0].id;
    const repo = new ParametresRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), parametresRepo: repo, parametresDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from parametres_artisan where "artisanId"=$1', [artisanA]);
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    await admin.query('delete from artisans where "userId"=$1', [UP]);
    await admin.query("delete from users where id=$1", [UP]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — update → parametres ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UP);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "parametres.update", { prefixeDevis: "DEV", notificationsEmail: true }, tA);
    expect(res.statusCode).toBe(200);
    const row = (await admin.query("select * from event_outbox where \"artisanId\"=$1 and action='parametres.mis_a_jour'", [artisanA])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UP);
    expect(row.entityType).toBe("parametres");
    expect(row.entityId).toBe(artisanA);
    const champsModifies = (row.payload as { champsModifies?: string[] }).champsModifies ?? [];
    expect(champsModifies).toContain("prefixeDevis");
    expect(champsModifies).toContain("notificationsEmail");
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après upsert parametres → 0 ligne parametres ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UP, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new ParametresRepositoryDrizzle(app.db);
    await admin.query('delete from parametres_artisan where "artisanId"=$1', [artisanA]);
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    const paramsBefore = Number((await admin.query('select count(*) from parametres_artisan where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.upsert(ctx, { prefixeDevis: "FAIL" });
        if (tx) await outboxEvent(tx, ctx, { action: "parametres.mis_a_jour", entityType: "parametres", entityId: artisanA, payload: { champsModifies: ["prefixeDevis"] } });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const paramsAfter = Number((await admin.query('select count(*) from parametres_artisan where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(paramsAfter).toBe(paramsBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});
