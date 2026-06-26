import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { AvisRepositoryDrizzle } from "../../infra/avis-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9934001;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("avis.router outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let clientA = 0;
  let avisId = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from avis_clients where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Client Avis"])).rows[0].id;
    const { rows } = await admin.query(
      'insert into avis_clients ("artisanId","clientId",note,statut,"createdAt","updatedAt") values ($1,$2,$3,$4,now(),now()) returning id',
      [artisanA, clientA, 4, "en_attente"],
    );
    avisId = rows[0].id as number;
    const repo = new AvisRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), avisRepo: repo, avisDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    await admin.query('delete from avis_clients where "artisanId"=$1', [artisanA]);
    await admin.query('delete from clients where "artisanId"=$1', [artisanA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — repondre → avis ET event_outbox co-écrits (action avis.repondu + payload)", async () => {
    const tA = await token(UA);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await mut(server, "avis.repondre", { avisId, reponse: "Merci pour votre confiance !" }, tA);
    expect(res.statusCode).toBe(200);
    const row = (
      await admin.query("select * from event_outbox where \"entityId\"=$1 and action='avis.repondu'", [avisId])
    ).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UA);
    expect(row.entityType).toBe("avis");
    expect((row.payload as { avisId?: number }).avisId).toBe(avisId);
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après repondre → update ET event_outbox rollbackés", async () => {
    const repo = new AvisRepositoryDrizzle(app.db);
    const ctx = { artisanId: artisanA, userId: UA, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const reponseBefore = (
      await admin.query('select "reponseArtisan" from avis_clients where id=$1', [avisId])
    ).rows[0].reponseArtisan as string | null;

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.repondre(ctx, avisId, "réponse simulée à rollbacker");
        if (tx) await outboxEvent(tx, ctx, { action: "avis.repondu", entityType: "avis", entityId: avisId, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const reponseAfter = (
      await admin.query('select "reponseArtisan" from avis_clients where id=$1', [avisId])
    ).rows[0].reponseArtisan as string | null;
    expect(outboxAfter).toBe(outboxBefore);
    expect(reponseAfter).toBe(reponseBefore);
  });
});
