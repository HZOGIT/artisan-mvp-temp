import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { CategorieDepenseRepositoryDrizzle } from "../../infra/categorie-depense-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9949002;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("categoriesDepenses.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query("delete from categories_depenses where artisan_id in (select id from artisans where \"userId\"=$1)", [UA]);
    await admin.query("delete from event_outbox where \"artisanId\" in (select id from artisans where \"userId\"=$1)", [UA]);
    await admin.query("delete from artisans where \"userId\"=$1", [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    artisanA = (await admin.query("insert into artisans (\"userId\") values ($1) returning id", [UA])).rows[0].id;
    const repo = new CategorieDepenseRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), categorieDepenseRepo: repo, categoriesDepensesDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query("delete from categories_depenses where artisan_id=$1", [artisanA]);
    await admin.query("delete from event_outbox where \"artisanId\"=$1", [artisanA]);
    await admin.query("delete from artisans where \"userId\"=$1", [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → categorie ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UA);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "categoriesDepenses.create", { nom: "Transport outbox" }, tA);
    expect(res.statusCode).toBe(200);
    const categorieId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='categorie_depense.creee'", [categorieId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UA);
    expect(row.entityType).toBe("categorie_depense");
    expect((row.payload as { nom?: string }).nom).toBe("Transport outbox");
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après write categorie → 0 categorie ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UA, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new CategorieDepenseRepositoryDrizzle(app.db);
    const catBefore = Number((await admin.query("select count(*) from categories_depenses where artisan_id=$1", [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { nom: "Rollback outbox" });
        if (tx) await outboxEvent(tx, ctx, { action: "categorie_depense.creee", entityType: "categorie_depense", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const catAfter = Number((await admin.query("select count(*) from categories_depenses where artisan_id=$1", [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(catAfter).toBe(catBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});
