import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { PrevisionCARepositoryDrizzle } from "../../infra/prevision-ca-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UPC = 9971001;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("previsionsCA.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from previsions_ca where "artisanId" in (select id from artisans where "userId"=$1)', [UPC]);
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UPC]);
    await admin.query('delete from artisans where "userId"=$1', [UPC]);
    await admin.query("delete from users where id=$1", [UPC]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UPC, `u${UPC}@t.fr`]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UPC])).rows[0].id;
    const repo = new PrevisionCARepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), previsionCARepo: repo, previsionCADb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from previsions_ca where "artisanId"=$1', [artisanA]);
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    await admin.query('delete from artisans where "userId"=$1', [UPC]);
    await admin.query("delete from users where id=$1", [UPC]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → prevision_ca ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UPC);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "previsions.create", { mois: 6, annee: 2026, caPrevisionnel: "1500.00" }, tA);
    expect(res.statusCode).toBe(200);
    const previsionId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='prevision_ca.creee'", [previsionId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UPC);
    expect(row.entityType).toBe("prevision_ca");
    expect((row.payload as { montantPrevu?: string }).montantPrevu).toBe("1500.00");
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après create prevision_ca → 0 prevision ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UPC, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new PrevisionCARepositoryDrizzle(app.db);
    const prevBefore = Number((await admin.query('select count(*) from previsions_ca where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { mois: 7, annee: 2026 });
        if (tx) await outboxEvent(tx, ctx, { action: "prevision_ca.creee", entityType: "prevision_ca", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const prevAfter = Number((await admin.query('select count(*) from previsions_ca where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(prevAfter).toBe(prevBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});
