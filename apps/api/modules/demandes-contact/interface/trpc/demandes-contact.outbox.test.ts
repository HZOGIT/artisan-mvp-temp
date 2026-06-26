import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DemandeContactRepositoryDrizzle } from "../../infra/demande-contact-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UPC = 9972001;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("demandesContact.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from demandes_contact where "artisanId" in (select id from artisans where "userId"=$1)', [UPC]);
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UPC]);
    await admin.query('delete from artisans where "userId"=$1', [UPC]);
    await admin.query("delete from users where id=$1", [UPC]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UPC, `u${UPC}@t.fr`]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UPC])).rows[0].id;
    const repo = new DemandeContactRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), demandeContactRepo: repo, demandeContactDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from demandes_contact where "artisanId"=$1', [artisanA]);
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    await admin.query('delete from artisans where "userId"=$1', [UPC]);
    await admin.query("delete from users where id=$1", [UPC]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → demande_contact ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UPC);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "demandesContact.create", { nom: "Alice Dupont", email: "alice@example.com" }, tA);
    expect(res.statusCode).toBe(200);
    const demandeId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='demande_contact.creee'", [demandeId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UPC);
    expect(row.entityType).toBe("demande_contact");
    expect((row.payload as { nom?: string }).nom).toBe("Alice Dupont");
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après create demande_contact → 0 demande ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UPC, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new DemandeContactRepositoryDrizzle(app.db);
    const demBefore = Number((await admin.query('select count(*) from demandes_contact where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { nom: "Bob Rollback" });
        if (tx) await outboxEvent(tx, ctx, { action: "demande_contact.creee", entityType: "demande_contact", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const demAfter = Number((await admin.query('select count(*) from demandes_contact where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(demAfter).toBe(demBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});
