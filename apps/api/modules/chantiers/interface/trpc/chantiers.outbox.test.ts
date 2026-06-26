import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ChantierRepositoryDrizzle } from "../../infra/chantier-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UC = 9939003;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("chantiers.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanC = 0;
  let clientC = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UC]);
    await admin.query('delete from chantiers where "artisanId" in (select id from artisans where "userId"=$1)', [UC]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UC]);
    await admin.query('delete from artisans where "userId"=$1', [UC]);
    await admin.query("delete from users where id=$1", [UC]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UC, `u${UC}@t.fr`]);
    artisanC = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UC])).rows[0].id;
    clientC = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanC, "Client Outbox"])).rows[0].id;
    const repo = new ChantierRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), chantierRepo: repo, chantiersDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanC]);
    await admin.query('delete from chantiers where "artisanId"=$1', [artisanC]);
    await admin.query('delete from clients where "artisanId"=$1', [artisanC]);
    await admin.query('delete from artisans where "userId"=$1', [UC]);
    await admin.query("delete from users where id=$1", [UC]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → chantier ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tC = await token(UC);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "chantiers.create", { clientId: clientC, reference: "CHT-001", nom: "Chantier Pilote" }, tC);
    expect(res.statusCode).toBe(200);
    const chantierId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='chantier.cree'", [chantierId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanC);
    expect(row.userId).toBe(UC);
    expect(row.entityType).toBe("chantier");
    expect((row.payload as { clientId?: number }).clientId).toBe(clientC);
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après write chantier → 0 chantier ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanC, userId: UC, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new ChantierRepositoryDrizzle(app.db);
    const cntBefore = Number((await admin.query('select count(*) from chantiers where "artisanId"=$1', [artisanC])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { clientId: clientC, reference: "CHT-ROLLBACK", nom: "Rollback Test" });
        if (tx) await outboxEvent(tx, ctx, { action: "chantier.cree", entityType: "chantier", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const cntAfter = Number((await admin.query('select count(*) from chantiers where "artisanId"=$1', [artisanC])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(cntAfter).toBe(cntBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});
