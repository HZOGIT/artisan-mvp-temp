import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { FournisseurRepositoryDrizzle } from "../../infra/fournisseur-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UF = 9939005;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("fournisseurs.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanF = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UF]);
    await admin.query('delete from articles_fournisseurs where "fournisseurId" in (select id from fournisseurs where "artisanId" in (select id from artisans where "userId"=$1))', [UF]);
    await admin.query('delete from fournisseurs where "artisanId" in (select id from artisans where "userId"=$1)', [UF]);
    await admin.query('delete from artisans where "userId"=$1', [UF]);
    await admin.query("delete from users where id=$1", [UF]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UF, `u${UF}@t.fr`]);
    artisanF = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UF])).rows[0].id;
    const repo = new FournisseurRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), fournisseurRepo: repo, fournisseursDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanF]);
    await admin.query('delete from articles_fournisseurs where "fournisseurId" in (select id from fournisseurs where "artisanId"=$1)', [artisanF]);
    await admin.query('delete from fournisseurs where "artisanId"=$1', [artisanF]);
    await admin.query('delete from artisans where "userId"=$1', [UF]);
    await admin.query("delete from users where id=$1", [UF]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → fournisseur ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tF = await token(UF);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "fournisseurs.create", { nom: "Fournisseur Pilote" }, tF);
    expect(res.statusCode).toBe(200);
    const fournisseurId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='fournisseur.cree'", [fournisseurId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanF);
    expect(row.userId).toBe(UF);
    expect(row.entityType).toBe("fournisseur");
    expect((row.payload as { nom?: string }).nom).toBe("Fournisseur Pilote");
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après write fournisseur → 0 fournisseur ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanF, userId: UF, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new FournisseurRepositoryDrizzle(app.db);
    const cntBefore = Number((await admin.query('select count(*) from fournisseurs where "artisanId"=$1', [artisanF])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { nom: "Rollback Test" });
        if (tx) await outboxEvent(tx, ctx, { action: "fournisseur.cree", entityType: "fournisseur", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const cntAfter = Number((await admin.query('select count(*) from fournisseurs where "artisanId"=$1', [artisanF])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(cntAfter).toBe(cntBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});
